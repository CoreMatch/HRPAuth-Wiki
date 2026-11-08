---
title: HA-Services-Deployer 开发者文档
description: Deployer 的代码结构、构建与测试、扩展点与契约（deploy-manifest、凭据扫描、回滚语义）、数据形态与兼容规则。
order: 2
tags:
  - deployer
  - development
updatedAt: 2026-11-08
---

# HA-Services-Deployer — 开发

## 代码结构

```
main.go                入口：config.Load → 可选 orchestrator.New → server.NewRouter
internal/
  artifact/            产物暂存与 SHA-256 校验
  config/              配置加载、版本迁移（v1→v2）、凭据文件读取
  docker/              docker CLI 封装与端点探测
  manifest/            deploy-manifest 装载、校验、凭据扫描
  models/              Config 与 Manifest 结构、默认值、校验规则
  orchestrator/        编排核心：
                         orchestrator.go  运行/回滚入口与级联
                         pipeline.go      裸金属版本切换（软链原子替换）
                         plan.go          运行计划
                         preflight.go     一次性前置检查
                         smoke.go         部署后冒烟断言
                         container.go     容器运行时（镜像即版本、孤儿处置）
                         state.go         运行状态与记录（续跑依据）
  probe/               健康探测
  server/              路由与处理器（下发面 + 编排面）
  tinyvisor/           Tinyvisor HTTP 客户端
deploy/                平台 Compose 模板与各服务配置模板
```

## 构建与测试

```bash
go build -o ./build/hasd .
go vet ./...
go test ./...          # 提交前全绿，需要时追加 -race
```

本地真机验证（真实 Deployer + 真实 Tinyvisor + 面板，全部回环、不碰生产）：按 `README.md` 的 "Local alignment environment" 一节搭建；核对口径是面板计数、API 返回与 `state_dir/runs/*.json` 三方一致。

## 扩展点与契约

### deploy-manifest v1

- 结构权威：`internal/manifest/manifest.go::Manifest`（`SchemaVersion = 1`）。
- 双层模型：`facts`（运行时无关：端口、健康、冒烟、依赖、数据目录、配置）+ `baremetal` / `container`（运行时执行方式）；顶层 `runtime` 选择器二选一（默认 `baremetal`），其他值校验即拒。
- 裸金属：`process.manager`（tinyvisor / aapanel / manual）、`install.root` + `releases/` + `current` 软链、`install.shared_data`（版本目录外的共享数据目录）、`artifact.source`（`local_path` 启用 / `ci_release` 已实现未启用）。
- 容器：`image.source`（build / local_image / registry）、`volumes`（宿主相对路径映射）。
- 清单校验报告携带 `DuplicateGroup`，由调用方按 `strict_project_names` 决定警告或拒绝（`internal/manifest/manifest.go`）。

### 凭据扫描

`internal/manifest/manifest.go::scanCredentials` 对清单原始结构全文扫描，命中任一即整体拒绝装载（报位置与原因）：

1. 凭据类键名（password / secret / token / api_key / credential / private_key / access_key 等）带字面值——必须是整值 `${secret:<name>}` 引用；
2. 任意位置值形似密钥材料（PEM 私钥块、GitHub 令牌族、AWS 密钥、JWT、≥48 位 hex/base64）；
3. 非法占位符（非整值 `${secret:<name>}` 的 `${...}`）。

### 编排语义锚点

- 版本切换：`internal/orchestrator/pipeline.go::switchSymlink`（临时链接 + rename 原子切换）；启动脚本以 `./current/<binary>` 为入口。
- 回滚：`internal/orchestrator/orchestrator.go::Rollback`；裸金属回上一版本目录，容器按运行记录 `active_image_id`（镜像摘要）定位，拒绝按标签，目标摘要缺失即显式拒绝。
- 前置检查：`internal/orchestrator/preflight.go`；冒烟：`internal/orchestrator/smoke.go`（失败 = 部署失败，走自动回滚）。
- 鉴权：`internal/server/handlers_deploy.go` 的 `deployAuth`（`X-Deploy-Token`；未配置令牌 503，错误/缺失 401）。
- docker 端点探测：`internal/docker/docker.go::DetectHost`；inspect 一律 `docker container inspect`（`internal/docker/docker.go::CLI.Inspect`）。

### HTTP 面

- 下发面（只读、不鉴权）：`/healthz`、`/api/v1/manifest`、`/api/v1/projects`、`/api/v1/artifacts/:service/*filepath`（路径经 `filepath.Clean` + `..` 前缀检查）。
- 编排面：只读 `/api/v1/deploy/{manifests,validate,status,preflight,runs}` 不鉴权；变更 `POST /api/v1/deploy/{run,rollback}` 经 `deployAuth`。
- 响应信封 `{success, message, data}`。

## 数据形态

- `data/manifest.json`：版本清单 v1（按服务版本组织；校验规则：服务名唯一小写、artifact id 服务内唯一、`role` ∈ binary/archive/asset、sha256 为 64 位小写 hex、`download_path` 不越出产物根）。
- `data/artifacts/`：产物存储根。
- `data/deploy/`（`state_dir`）：运行状态与 `runs/*.json` 运行记录（断点续跑依据）。
- `credentials.json`（`credentials_path`，0600，不进仓库）：`tinyvisor_api_key` / `deploy_token` / `github_token` / `smoke_secrets`。

## 兼容与边界规则

- 配置装载时自动迁移（v1→v2 仅补 `orchestration` 零值段）。
- manifest v1 明确不覆盖首次部署初始化与配置模板渲染。
- `orchestration.enabled=false`（零值）时编排器不构造，服务行为与纯下发模式完全一致。
- `manager: aapanel | manual` 的项目一律 foreign：只读列出，绝不触碰。
- 发布命名约定（`ci_release` 启用时）：`<项目名>-linux-amd64` + `<项目名>-linux-amd64.sha256`。
- 版本清单契约记录：本仓 `knowledge/0006-version-manifest.md`；编排边界 `knowledge/0007-bare-metal-orchestration-scope.md`、`knowledge/0011-container-orchestration-minimal-loop.md`。
