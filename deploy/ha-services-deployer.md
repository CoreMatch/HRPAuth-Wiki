---
title: HA-Services-Deployer 部署者文档
description: Deployer 的运行前提、从零部署、配置项表、端口暴露、启停升级、部署验证与故障对照。
order: 1
tags:
  - deployer
  - deployment
updatedAt: 2026-11-11
---

# HA-Services-Deployer — 部署

版本清单与产物分发后端；可选启用为裸金属/容器部署编排器（前置检查、版本切换、经 Tinyvisor 重启、健康与冒烟、回滚）。纯本地文件服务：无数据库、无 Redis。

## 运行前提

| 项 | 要求 |
|---|---|
| 运行时 | 静态链接 Go 二进制（Go 1.26.0+ 构建，见 `go.mod`）；无其他运行时依赖 |
| 编排（可选）裸金属 | 目标机有 Tinyvisor（进程监督；清单 `manager: tinyvisor` 的项目经它重启） |
| 编排（可选）容器 | docker；rootless 支持，端点探测顺序：`DOCKER_HOST` → `$XDG_RUNTIME_DIR/docker.sock` → `/var/run/docker.sock`（`internal/docker/docker.go::DetectHost`） |
| 凭据文件（编排） | `credentials.json`（0600，不进仓库）：`tinyvisor_api_key` / `deploy_token` / `github_token` / `smoke_secrets` |

## 从零部署

```sh
go build -o ./build/hasd .
./build/hasd        # 或 go run .
```

- 首次启动自动生成 `config.yaml`（默认：监听 `:2770`、产物根 `./data/artifacts`、清单 `./data/manifest.json`）。
- 立即提供版本数据：创建 `data/manifest.json`，可从 `examples/manifest.v1.json` 起步。
- 启用编排：`config.yaml` 改为 `version: "2"` 并加 `orchestration` 段：

```yaml
orchestration:
  enabled: true
  scan_roots: ["../"]                    # 扫描 <root>/<repo>/deploy-manifest.yaml
  external_manifests: ./deploy/manifests # mysql/redis 等外部依赖声明
  state_dir: ./data/deploy
  tinyvisor: { url: "http://127.0.0.1:7891" }
  credentials_path: ./data/deploy/credentials.json
```

- 启用成功标志：启动日志 `orchestration enabled: scan_roots=... tinyvisor=...`。
- 本服务自身由面板管理（`deploy-manifest.yaml` 声明 `manager: aapanel`），编排器对自身只读；清单预定安装根 `/www/wwwroot/hasd`、二进制 `hasd`。清单注明本服务尚未在生产部署，首次实际部署以现场为准。

### 平台镜像（已发布）

容器编排的 10 个镜像已真实发布到 Docker Hub 命名空间 `limeight/ha-*`（真实 build → push → 删本地 → 回拉 → 挂回 compose 平台全量冒烟）。命名规则：`limeight/ha-<服务名>`；tag = `<版本>-<短SHA>`（无版本号的用纯短 SHA，均可回追 commit），并列 `latest`；**生效引用一律钉 digest**（各仓 `deploy-manifest.yaml` 的 `container.image.digest`）。

**多架构**：10 个镜像均为 `linux/amd64` + `linux/arm64` 多架构镜像（OCI image index / manifest list），同一引用在不同架构机器上自动解析到对应平台的镜像。清单钉的是 **manifest list 的 digest**，不是单平台子镜像的 digest——钉到子 digest 会让另一种架构的机器拉到错误平台的镜像。构建事实：

- arm64 腿在 amd64 构建机上经 QEMU 用户态模拟构建（`docker-container` driver 的 buildx builder），单镜像耗时约为原生构建的 5–15 倍，属预期，不因此降级为单平台。
- 个别镜像在模拟下可能构建失败（模拟开销、工具链兼容等），失败逐个排查，不静默跳过、不偷偷回退单平台。已知一例与模拟无关的坑：依赖补丁把 `go.mod` 提到更高 Go 版本后，Dockerfile 钉的旧 `GO_VERSION` 基础镜像会在 `go mod download` 报 `go.mod requires go >= …`（官方 golang 镜像 `GOTOOLCHAIN=local` 不自动升级工具链），构建时以 `--build-arg GO_VERSION=<go.mod 要求值>` 覆盖即可，无需改 Dockerfile。
- 可复现参数：`--provenance=false --sbom=false` + `SOURCE_DATE_EPOCH=0`。

| 镜像 | 对应仓 |
|---|---|
| `limeight/ha-hrpauth` | HRPAuth |
| `limeight/ha-hrpauth-yggdrasil-api` | HRPAuth-Yggdrasil-API |
| `limeight/ha-haskinlib` | HASkinLib |
| `limeight/ha-haskinproxy` | HASkinProxy |
| `limeight/ha-winnerproxy` | WinnerProxy |
| `limeight/ha-mca-server` | MatchCoreArena-Server |
| `limeight/ha-webui-sdkhandler` | HA-WebUI-SDKHandler |
| `limeight/ha-services-deployer` | HA-Services-Deployer |
| `limeight/ha-services-maintenance-view` | HA-Services-MaintenanceView |
| `limeight/ha-bs2ha` | BS2HA（一次性迁移工具，不在编排内） |

**镜像怎么被消费**：清单声明 `container.image.source: registry` 的项目，编排器在部署时真实拉取——

- **digest 优先**：声明了 `digest` 就按 `repo@sha256:...` 拉（拉取即钉死内容）；仅声明 `tag` 时退回按 tag 拉（不推荐，tag 可被重打移动）。
- **拉后对照**：镜像实际 registry 摘要必须包含清单声明的 digest，不一致**响亮失败**、绝不建容器（防清单漂移或 registry 侧内容被换）。
- **鉴权**：沿用宿主 docker 登录态（`docker login` 一次即可，编排器不持有任何 registry 凭据）。私有仓库拉不动时错误按原因分类：401 认证失败（未登录/登录过期）、403 无权限（命名空间不开放）、404 引用不存在、429 限流——各是各的问题，不会吞成一句 "pull failed"。
- `ha-webui-nginx` 用库存镜像 `nginx:1.27-alpine`，不自建。

### 清单 kind 三种形态

- `service`：有自己进程与端口的服务——声明端口、健康端点、依赖、裸金属/容器执行段，是部署流水线的完整对象。
- `external`：不在编排内的外部依赖（如面板装的 MySQL/Redis）——只做可达性检查。
- `plugin`：插件型产物（装进别人进程的 jar 一类，如 VelocityGate、BedwarsRel-MCA）——声明安装目标运行时（`plugin.runtime`，目标在编排体系内时可加 `target_project`）、`plugin.plugins_dir` 与产物；没有自身进程，故不声明端口与健康端点。编排器对插件条目**只登记与校验、不执行安装**（阶段未设），运行记录中结果为 `plugin`，回滚被明确拒绝。缺 `plugin` 段或其必填字段时聚合校验响亮失败。

### local_path 产物纪律

清单声明 `baremetal.artifact.source: local_path` 的项目（当前全部），部署流水线硬要求**产物文件 + 同目录同名 `.sha256` 旁路**两件齐备，且旁路声明的校验和必须与产物内容一致——临时文件落盘、整体校验、原子改名，残缺或掉包产物进不了版本目录。preflight（deploy 模式）对这三点逐一检查，缺任一即阻断并点名路径。因此**构建脚本产出二进制时必须同时产出 `.sha256`**（`sha256sum <binary> | awk '{print $1}' > <binary>.sha256`）；只交二进制不交旁路的构建产物无法进入编排部署。

## 配置项表

配置在 `config.yaml`，启动时读取（`main.go::config.Load`）；仓库未声明热加载机制，改动重启生效。旧版本文件装载时自动迁移（v1→v2 仅补 `orchestration` 零值段）。

| 键 | 类型 | 默认 | 作用 |
|---|---|---|---|
| `version` | string | "1" | 配置结构版本 |
| `server.listen` | string | `:2770` | 监听地址 |
| `storage.artifacts_root` | string | `./data/artifacts` | 产物存储根目录 |
| `manifest.path` | string | `./data/manifest.json` | 版本清单文件路径 |
| `orchestration.enabled` | bool | false | 编排总开关；关闭时行为与纯下发模式完全一致 |
| `orchestration.scan_roots` | []string | 空 | 清单扫描根（`<root>/<repo>/deploy-manifest.yaml`） |
| `orchestration.external_manifests` | string | 空 | 无仓库归属的依赖声明目录（`*.yaml`） |
| `orchestration.state_dir` | string | `<data>/deploy` | 运行状态与运行记录目录（续跑依据） |
| `orchestration.probe_host` | string | 127.0.0.1 | 健康探测目标主机 |
| `orchestration.tinyvisor.url` | string | 空 | Tinyvisor 地址 |
| `orchestration.credentials_path` | string | 空 | 凭据文件路径（0600） |
| `orchestration.strict_project_names` | bool | false | true 时项目重名按校验失败拒绝运行；默认重名取扫描顺序第一个并记警告 |
| `orchestration.container.docker_host` | string | 空 | docker 端点；空按上述顺序探测 |
| `orchestration.container.orphan_policy` | string | report | 孤儿容器（带编排标签但不在清单中）：report 只报不删 / remove 删除 |
| `orchestration.overrides.<项目>.*` | object | 空 | 按部署上下文覆盖单项目参数：`runtime` / `manager` / `install_root` / `health_port` / `ports` / `service_version` / `artifact_local_path` |

## 端口与暴露面

| 端口 | 来源 | 暴露 |
|---|---|---|
| `:2770` | 代码默认（`internal/models/config.go::DefaultConfig`） | 仅回环（`deploy-manifest.yaml` 声明 `exposure: loopback`） |
| `:18080` | 部署模板（`deploy/config/ha-services-deployer.yaml.tmpl`） | 仅回环 |

两处定义不一致：任选其一，并与 HA-Services-MaintenanceView 的 `deployer.base_url` 保持一致。

## 启动 / 停止 / 升级 / 回滚

- 本服务自身：`manager: aapanel`（面板管理），启停升级按面板操作；编排器不部署、不回滚它自己。
- 不经面板时：直接运行二进制；停止 = SIGTERM。
- 它管理的项目：全部经部署端点操作——`POST /api/v1/deploy/run`（部署）、`POST /api/v1/deploy/rollback`（回滚）、先 `GET /api/v1/deploy/preflight` 或 `dry_run` 预检。不要绕过编排器手搓版本目录或软链。

## 验证

```sh
curl -s http://127.0.0.1:2770/healthz
# 期望：200

curl -s http://127.0.0.1:2770/api/v1/manifest
# 期望：信封 {success, message, data}，data 为清单内容

# 编排启用后
curl -s http://127.0.0.1:2770/api/v1/deploy/status
# 期望：各项目声明态 vs 实际态

curl -s "http://127.0.0.1:2770/api/v1/deploy/preflight"
# 期望：分级报告（阻断项/警告项，每条带路径或端口）

# 变更端点鉴权
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:2770/api/v1/deploy/run
# 期望：401（缺 X-Deploy-Token）；令牌未配置时 503（fail-closed）
```

## 故障对照

| 现象 | 原因 | 处理 |
|---|---|---|
| `POST /run`、`/rollback` 返回 503 | 未配置 `deploy_token`（fail-closed，绝不退化为无鉴权） | 在凭据文件配置 `deploy_token` 并重启 |
| `POST /run` 返回 400 附分级报告 | 前置检查阻断项（目录/软链不可写、env 缺失、密钥不可解析、Tinyvisor 不可达或密钥无效、端口被占、磁盘不足、产物或 `.sha256` 旁路缺失/不符、依赖不可达） | 按报告逐条修复，每条带具体路径/端口 |
| 清单装载被拒，报出位置与原因 | 命中凭据扫描：凭据类键名带字面值 / 值形似密钥材料 / 占位符不是整值 `${secret:<name>}` | 凭据改为 `${secret:<name>}` 引用，值放凭据文件 `smoke_secrets` |
| 校验报告出现项目重名警告 | 并行 worktree 等同名清单 | 默认按扫描根顺序取第一个；需要严格时开 `orchestration.strict_project_names` |
| 回滚被拒"目标镜像已不存在" | 容器回滚按运行记录的镜像摘要定位，该摘要镜像本机已不在 | 重新部署该版本记录新摘要；不存在按标签或近似镜像顶替的路径 |
| `docker inspect <名字>` 返回的 JSON 没有 `.State` | 项目名同时是镜像名，裸 `docker inspect` 解析成了镜像 | 一律 `docker container inspect` |
| <span v-pre>`{{.State.State}}`</span> 渲染为空 | 字段名错误 | 用 `.State.Status` |
