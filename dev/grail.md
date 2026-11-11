---
title: Grail 开发者文档
description: Grail 的代码结构、数据与签名模型、接口面（契约对照）、同步协议、鉴权分层与兜底限制、构建与测试。
order: 2
tags:
  - grail
  - development
updatedAt: 2026-11-12
---

# Grail — 开发

产物分发上游（原站 + 分级镜像）的实现说明。契约单一事实源：HA-Contract `docs/api/openapi/grail.yaml`（METHOD+path 双向防漂移，路由来源文件 `internal/server/router.go`）；语义单一事实源：`GRAIL-DESIGN-20261112.md`（R2）。

## 代码结构

```
main.go                     子命令：init / server / admin / publish / resolve / sync / yank / deprecate
internal/
  model/                    线上结构（密钥环、状态文档、版本清单、解析响应、同步批次）
  signing/                  Ed25519 信封签名/验签（对负载的规范化 JSON 字节）
  store/                    存储：内容寻址 blob、版本记录、序号、日志、节点登记；全部临时文件+原子改名
  config/                   节点配置（YAML）与凭据（JSON 0600）
  httputil/                 兜底防护：内网地址判定与重定向守卫（SSRF）
  client/                   HTTP 客户端：节点签名请求、令牌请求、同步/上传/解析
  syncer/                   镜像同步引擎（验签顺序、字节抓取、状态收敛、孤儿清理）
  server/                   HTTP 面：router.go（契约路由表）+ 读写处理函数 + 鉴权 + 清扫循环
examples/demo-service/      E2E 用最小服务（/healthz + 版本字符串）
```

## 数据与签名模型

四层，严格区分内容与引用：

- **内容层**：blob，内容寻址（`sha256:<64hex>`），同字节全节点只存一份；
- **描述层**：版本清单（版本、资源、血缘），**项目密钥签名**，发布后不可变；
- **引用层**：指针（渠道 × 版本 → 清单）、发布序号、选择状态（yank/宽限，**根密钥签名**，单调序号防回滚）、变更日志（journal，同步游标）；
- **访问层**：规范取件 URL `/{project}/{channel}/{version}/{platform}`——本节点托管则 200 直供，否则 302（原站转外部地址，镜像转上级规范 URL）。

签名约定：

- 签名 = Ed25519 over **信封内的 payload 字节原文**（固定结构体 `encoding/json` 序列化，天然确定）；验签方绝不重新序列化。
- 信任链：本地钉住的根公钥 → 验证密钥环（并钉住其中的根公钥）→ 按项目取公钥 → 验证版本清单 → digest 传导到字节。
- 镜像不持有任何发布密钥、不重签；被攻破最多拒绝服务，造不出合法假货。

版本语义硬约束：

- 版本字符串**不透明**：唯一形态约束是 URL 安全字符集；任何代码不得解析其数字、不得据此推断渠道或成熟度；
- `(project, channel, version)` 唯一且**永久消耗**；
- `latest` = 渠道内未被 yank、不在宽限期、发布序号最高者；无可选项时显式 404；
- 生命周期状态机 `active → deprecating(grace) → removed`；`yanked` 是正交标志。被引用（血缘）版本拒绝进入清理。

## 接口面（与契约对照）

| 族 | 端点 | 鉴权 |
|---|---|---|
| 取件 | `GET /{project}/{channel}/{version}/{platform}`（含 HEAD） | release 公开节点匿名；ci/candidate 需读凭据或节点身份 |
| 信任分发 | `GET /v1/keyring`、`GET /v1/revocations` | 匿名 |
| 解析 | `GET /v1/projects/{p}/channels/{c}/versions`、`.../resolve`、`.../versions/{v}` | 渠道读规则 |
| 字节 | `GET/HEAD /v1/blobs/{digest}`（节点身份）、`POST /v1/blobs`（发布令牌，`X-Grail-Digest` 声明） | 见左 |
| 发布 | `POST /v1/projects/{p}/channels/{c}/versions` | 发布令牌（渠道范围），仅原站 |
| 维护 | `POST/DELETE .../versions/{v}/yank`、`.../deprecate` | 管理令牌，仅原站 |
| 同步 | `GET /v1/sync/changes?since=<cursor>` | 节点身份 |
| 管理 | `POST /v1/admin/projects`、`POST/GET /v1/admin/nodes`、`DELETE /v1/admin/nodes/{node}` | 管理令牌，仅原站 |

镜像请求发布/管理面一律 403。所有 4xx/5xx 显式给出原因，禁止静默降级。

## 节点身份签名

同步与内部字节访问使用登记的节点密钥对：

```
头：X-Grail-Node-Id / X-Grail-Timestamp / X-Grail-Signature
签名消息 = nodeID "\n" timestamp "\n" METHOD "\n" path（不含 query）
算法 Ed25519，时间窗 ±300s；节点渠道权限在登记时声明。
```

"谁能读"（读凭据/匿名）与"谁能建镜像"（节点身份）是**两套不可合并的身份**。

## 同步协议（只拉不推）

镜像每次同步的顺序是硬约定：

1. `GET /v1/sync/changes?since=<cursor>`（节点签名）；
2. 密钥环：锚点验签 + 钉住根公钥 + 拒绝序号回退；
3. 选择状态（yank/宽限）：根公钥验签 + 序号前进，收敛到本地版本记录；
4. 版本清单：逐个按项目密钥验签后入库（按渠道策略过滤：full / subscribe / none），并写入本地 journal（供再下一级同步）；
5. 移除通知：删本地记录；
6. 字节抓取：对策略覆盖的版本**优先抓字节落盘**（经上游 `/v1/blobs`），失败/超限记为未落盘项并显式汇报；
7. 持久化游标；有移除时做孤儿字节清理。

任何验签失败 = 整次同步显式失败。

## 兜底限制（消费方默认信任上游，节点单方执行）

- 签名与摘要校验（端到端）；
- 大小上限（`node.limits.max_artifact_bytes`，流式中途强制）；
- 发布登记的外部 URL 与抓取途中的重定向一律做内网地址判定，指向环回/私网/链路本地即拒绝（SSRF 守卫）；
- 抓取外部字节不携带任何凭据（不代管外部凭据）；
- 重定向上限 5 跳。

## 构建与测试

```bash
go build ./... && go vet ./... && go test -race ./...
docker build -t grail:local .
```

集成测试（`internal/server/server_test.go`）覆盖：发布 → 解析验签 → 规范取件、版本永久消耗、渠道读权限、yank/宽限与"被引用拒绝清理"、镜像真实同步（字节落盘 + 302 回退 + 未登记节点拒绝）、镜像拒载写面。

## 契约与防漂移

- 新增/修改路由：先改 HA-Contract `grail.yaml`（契约先行），再改 `internal/server/router.go`；
- 本地联查：`HA-Contract/scripts/check-openapi-validity.sh` + `check-business-api-drift.sh`（均带 `--self-test`）；
- 提交纪律：build/vet/test -race 全绿后，特性分支 `--no-ff` 合并再推送。
