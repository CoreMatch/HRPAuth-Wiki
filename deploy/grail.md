---
title: Grail 部署者文档
description: Grail 产物分发上游的运行前提、Root 与下游节点从零启动、发布与同步、Deployer 接入、撤销与宽限期操作、故障对照。
order: 1
tags:
  - grail
  - deployment
updatedAt: 2026-11-12
---

# Grail — 部署

HA 生态的产物分发上游：**原站（Root）+ 分级镜像**的混合形态，为各服务提供 `ci` / `candidate` / `release` 三渠道的**签名**发布物。设计依据：`GRAIL-DESIGN-20261112.md`（R2 定稿）；接口契约：HA-Contract `docs/api/openapi/grail.yaml`。

## 角色定位

三层事实，部署前先读准：

1. **Grail 只管产物的发布与分发**：渠道、版本、血缘、签名、撤销、宽限期。它不构建（CI 把产物交给它）、不拉进程（那是 Tinyvisor）、不编排部署（那是 Deployer）。
2. **对外只有一个取件 URL**：`GET /{project}/{channel}/{version}/{platform}`。节点托管字节时直接给字节，否则 302 到实际供货方；消费方不需要知道字节在哪一层。
3. **签名从第一天存在**：每项目一把独立密钥，根密钥签密钥环。镜像不重签，下游只验原站签名。信任锚（根公钥）带外分发，钉在消费方本地。

当前阶段只覆盖**裸金属产物**；容器镜像的上下级同步尚未接入（设计稿"未来实现"留档）。

## 运行前提

| 项 | 要求 |
|---|---|
| 运行时 | 静态链接 Go 二进制或 `grail:local` 镜像；无数据库、无 Redis |
| 存储 | 数据目录（blob 内容寻址 + 元数据），磁盘容量按产物总量预留 |
| 网络 | 下游节点可访问上级节点；消费方（Deployer 等）可访问取件节点 |
| 凭据 | 凭据文件 0600，绝不进仓库；根公钥经安全渠道分发给消费方 |

## 从零起一个 Root（原站）

```bash
# 1. 初始化：生成根密钥、首个密钥环与状态文档、凭据文件（0600）
grail init --config root.yaml --credentials root-credentials.json \
  --data-dir /var/lib/grail --listen 127.0.0.1:2780 --name root --public
# 输出：根公钥（分发给所有下游与消费方）+ 管理令牌（只出现这一次）

# 2. 在凭据文件里补发布/读令牌（示例结构，值自拟）
#   "publish_tokens": [
#     {"name": "ci-bot",  "token": "...", "channels": ["ci"]},
#     {"name": "author",  "token": "...", "channels": ["candidate", "release"]}
#   ],
#   "read_tokens": [{"name": "deployer-x", "token": "...", "channels": ["ci","candidate","release"]}]

# 3. 启动
grail server --config root.yaml --credentials root-credentials.json
```

`grail init` 生成的 `root.yaml`：

```yaml
node:
  role: root
  listen: 127.0.0.1:2780
  public: true            # 公开节点：release 匿名可读；ci/candidate 始终要凭据
  data_dir: /var/lib/grail
  limits:
    max_artifact_bytes: 1073741824   # 兜底大小上限（默认 1 GiB）
```

Root 起来后登记项目与下游节点：

```bash
# 项目登记：生成该项目的独立签名密钥（私钥留在 Root 凭据文件，不外发）
grail admin project add --base-url http://127.0.0.1:2780 --admin-token <管理令牌> --name avalon

# 下游节点登记：返回的节点私钥只出现这一次，交给下游运维
grail admin node add --base-url http://127.0.0.1:2780 --admin-token <管理令牌> \
  --name mirror-bj --channels release,candidate
```

## 发布一个版本

先上传字节再登记版本；`candidate → release` 通常是**修正后重建**，血缘参数把两者关联起来（不是移动指针）。

```bash
# 候选：人挑/停放
grail publish --base-url http://127.0.0.1:2780 --token <author令牌> \
  --project avalon --channel candidate --version 0.6 \
  --resource avalon:linux-amd64:/build/avalon-linux-amd64 \
  --builder ci:github-actions/run-1234 --commit a1b2c3d

# 正式：按候选反馈修正后重新构建的产物，带血缘
grail publish --base-url http://127.0.0.1:2780 --token <author令牌> \
  --project avalon --channel release --version 0.6 \
  --resource avalon:linux-amd64:/build/avalon-linux-amd64.fixed \
  --builder ci:github-actions/run-1240 --commit b2c3d4e \
  --derived-channel candidate --derived-version 0.6 \
  --derived-note "按候选反馈修复匹配超时；重建后回归通过"
```

要点：

- 版本字符串是**不透明标识符**（沿用现有数字习惯即可），渠道内**永久消耗**：发布过的字符串不能再次发布，yank 后也不得复用。
- 版本号不表达成熟度，成熟度只看渠道；同一版本号可在三个渠道各自独立存在。
- 外部 URL 产物：`--external 名称,平台,url,sha256hex,大小`。原站会按兜底限制尝试抓取落盘（拒绝内网地址、大小上限、校验摘要），抓不动才以 302 外部地址降级供应。
- 同字节兼作 candidate 与 release 的边缘情况：血缘加 `--same-content` 显式声明（默认关闭）。

## 起一个下游节点（镜像）

```yaml
# mirror.yaml
node:
  role: mirror
  listen: 127.0.0.1:2780
  public: true
  data_dir: /var/lib/grail
mirror:
  upstream_base_url: http://root.example:2780
  sync_interval_seconds: 60
  channels:
    release:   { policy: full }                       # 全量
    candidate: { policy: subscribe, projects: [avalon] }  # 按项目订阅
    ci:        { policy: none }                       # 默认不镜像
```

```json
// mirror-credentials.json（0600）
{
  "node_id": "mirror-bj",
  "node_private_key": "<登记节点时一次性返回的私钥>",
  "root_public_key": "<Root 初始化时输出的根公钥>"
}
```

```bash
grail sync   --config mirror.yaml --credentials mirror-credentials.json   # 手动同步一次
grail server --config mirror.yaml --credentials mirror-credentials.json   # 常驻（按周期自动同步）
```

同步语义：**只拉不推**。每次同步先拉密钥环与撤销/宽限状态（验签、拒绝序号回退），再拉新版本清单（按项目密钥验签），然后**优先把字节抓下来落盘**；抓不动/超限才退回"只记地址"（该节点对规范 URL 回 302 到上级），并在同步输出中显式列出未落盘项。

## Deployer 接入

`deploy-manifest.yaml`（baremetal 段）：

```yaml
  artifact:
    source: grail
    grail:
      base_url: http://mirror-bj.example:2780   # 指向就近节点即可，消费方不感知供货方
      project: avalon
      channel: release
      version: latest          # 或钉死版本号；支持 {service_version} 占位
      platform: linux-amd64    # 可省，缺省即此值
```

Deployer 凭据文件追加两项：

```json
{
  "grail_root_public_key": "<根公钥 base64>",
  "grail_read_token": "<读凭据；公开节点的 release 可省>"
}
```

部署链路：预检阶段完成"解析 + 端到端验签"（信任锚 → 密钥环 → 项目密钥 → 版本清单），流水线从规范 URL 流式取字节、对 digest、临时文件 + 原子改名落版本目录。**版本目录与软链跟随实际解析到的 grail 版本**（`latest` 是动态结果，可能不等于清单的 `service_version`）。被 yank 的版本拒绝部署；宽限期中的版本钉住部署时会打警告。

## 运维操作

```bash
# 验证解析与签名链（消费方排障第一步）
grail resolve --base-url http://127.0.0.1:2780 --project avalon --channel release \
  --version latest --platform linux-amd64 --root-key <根公钥或@文件>

# 撤销：立即退出 latest 选择，字节仍在，显式钉住可取（带标记）
grail yank   --base-url ... --admin-token ... --project avalon --channel release --version 0.6 --reason "疑似问题"
grail unyank --base-url ... --admin-token ... --project avalon --channel release --version 0.6

# 宽限期：排期移除。宽限期内仍可读可下载（带标记），选择默认跳过，钉住可用
grail deprecate   --base-url ... --admin-token ... --project avalon --channel ci --version 0.6-ci.a1b2c3d --grace-seconds 604800
grail undeprecate --base-url ... --admin-token ... --project avalon --channel ci --version 0.6-ci.a1b2c3d
```

清理机制：宽限期满后原站自动物理移除（并清理孤儿字节）；**被血缘引用的版本拒绝清理**（发起时即 409 并给出引用清单）。`release` 渠道不进入自动清理。

节点吊销（定向撤销某个下游）：

```bash
grail admin node rm --base-url ... --admin-token ... --id mirror-bj
```

## 故障对照

| 现象 | 排查 |
|---|---|
| 发布报 `project not registered` | 先 `grail admin project add` |
| 发布报版本已被消耗 | 版本字符串渠道内永久消耗，换新的版本字符串 |
| 发布报 `resolves to an internal address` | 外部 URL 指向内网被 SSRF 守卫拒绝；换公网地址或改为上传字节 |
| 下游同步报密钥环验签失败 | 本地信任锚与上游根密钥不一致（上游换过根密钥需重新带外分发） |
| 下游同步报 `registered node identity required` | 节点未登记/已吊销，或节点签名时间窗（±300s）超限 |
| Deployer 预检报 `grail source requires grail_root_public_key` | 凭据文件缺信任锚 |
| Deployer 报版本 yanked | 上游撤销了该版本；确认原因后 unyank 或改用其他版本 |
| 取件 302 到了意外地址 | 该层节点未持有字节；查同步输出的未落盘项（抓取失败/超限） |
