---
title: HA-Services-Deployer 部署者文档
description: Deployer 的运行前提、从零部署、配置项表、端口暴露、启停升级、部署验证与故障对照。
order: 1
tags:
  - deployer
  - deployment
updatedAt: 2026-11-08
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
| `POST /run` 返回 400 附分级报告 | 前置检查阻断项（目录/软链不可写、env 缺失、密钥不可解析、Tinyvisor 不可达或密钥无效、端口被占、磁盘不足、依赖不可达） | 按报告逐条修复，每条带具体路径/端口 |
| 清单装载被拒，报出位置与原因 | 命中凭据扫描：凭据类键名带字面值 / 值形似密钥材料 / 占位符不是整值 `${secret:<name>}` | 凭据改为 `${secret:<name>}` 引用，值放凭据文件 `smoke_secrets` |
| 校验报告出现项目重名警告 | 并行 worktree 等同名清单 | 默认按扫描根顺序取第一个；需要严格时开 `orchestration.strict_project_names` |
| 回滚被拒"目标镜像已不存在" | 容器回滚按运行记录的镜像摘要定位，该摘要镜像本机已不在 | 重新部署该版本记录新摘要；不存在按标签或近似镜像顶替的路径 |
| `docker inspect <名字>` 返回的 JSON 没有 `.State` | 项目名同时是镜像名，裸 `docker inspect` 解析成了镜像 | 一律 `docker container inspect` |
| <span v-pre>`{{.State.State}}`</span> 渲染为空 | 字段名错误 | 用 `.State.Status` |
