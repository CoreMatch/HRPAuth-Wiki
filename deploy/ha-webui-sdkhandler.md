---
title: HA-WebUI-SDKHandler 部署者文档
description: SDKHandler 构建服务的运行前提、从零部署、配置项表、双端口暴露与 Internal Key 鉴权、验证与故障对照。
order: 1
tags:
  - sdkhandler
  - deployment
updatedAt: 2026-11-11
---

# HA-WebUI-SDKHandler — 部署

HA-WebUI-SDKHandler 是构建服务：轮询 HRPAuth 拉取 SDK 源码头包 → 全量注入 HRPAuth-WebUI 前端模板 → 编译聚合前端 → 把静态产物发布到固定产物目录（remove-then-rename 替换；已知托管缺口见仓内 `knowledge/0004`）。

## 运行前提

| 项 | 要求 |
|---|---|
| Go | 源码构建需要：`go.mod` 声明 `go 1.26.10`（README 写 1.25+，以 go.mod 为准） |
| Node.js / npm / git | **运行时必需**——前端编译发生在运行时（Docker 镜像已内置） |
| HRPAuth 核心 | 必需（唯一 SDK 包来源，经 `GET /services/sdk-packages` 轮询） |
| 前端模板 | 本地 HRPAuth-WebUI 检出，或配置 Git URL 自动克隆 |
| 数据库 / Redis | 无（状态落 `state_dir` 文件） |
| 进程监督 | 生产声明为 `manager: aapanel`（面板管理，编排器只读） |

## 从零部署

```sh
go build -o ./build/sdkhandler
cp config.example.yaml config.yaml    # 按下表修改
./build/sdkhandler
```

- 配置文件从**工作目录**读 `config.yaml`；环境变量 `SDKHANDLER_CONFIG` 覆盖路径。
- 必填项：`hrpauth.base_url`、`hrpauth.client_id`、`hrpauth.client_secret`（HRPAuth 的 OAuth2 服务凭据）、`hrpauth.internal_key`（组织统一的 `X-Internal-Key`；留空时 `/api/*` 全部 401，`/health` 不受影响）。
- Docker：镜像已发布到 Docker Hub——`limeight/ha-webui-sdkhandler`（`linux/amd64` + `linux/arm64` 多架构，tag `7195a69` 并列 `latest`，生效引用钉 manifest list digest `sha256:bd4137705d8e62a3718ecd24db6f444880cf9a5973f1cfa62b27484cab5d7f8f`）；多阶段构建，运行镜像含 node/npm/git。仓库 Dockerfile 仍在，本地构建也可行，部署引用以已发布镜像为准。
- 生产在位：`/www/wwwroot/sdkh/sdkhandler`（deploy-manifest）。

## 配置项表

配置文件 YAML（模板版本 4），启动时读取，改动重启生效。

### server

| 键 | 默认 | 作用 |
|---|---|---|
| `listen_addr` | `:2704` | API 端口（`/health`、`/api/build/status`、`/api/build/trigger`、`/api/revision`） |
| `maintenance_addr` | `:2705` | 维护端口（立即拉取模板等运维操作；无健康端点） |

### hrpauth

| 键 | 默认 | 作用 |
|---|---|---|
| `base_url` | `http://127.0.0.1:2778` | HRPAuth 核心地址（必填） |
| `client_id` / `client_secret` | `""` | OAuth2 服务凭据（必填） |
| `poll_interval_seconds` | `60` | SDK 包轮询周期 |
| `internal_key` | `""` | `X-Internal-Key` 共享密钥，与 HRPAuth 侧配置一致；**留空 = fail-closed**，`/api/*` 一律 401 |

### build

| 键 | 默认 | 作用 |
|---|---|---|
| `template_dir` | `./HRPAuth-WebUI` | 前端模板仓库路径（只读，每次构建全量复制） |
| `template_git_url` | `https://github.com/CoreMatch/HRPAuth-WebUI.git` | `template_dir` 为空或不存在时自动克隆的来源 |
| `work_dir` | `./frontend-build` | 构建工作目录（反复重建） |
| `artifacts_dir` | `./artifacts` | 带版本号的产物根目录 |
| `current_link` | `./current` | 当前生效产物的软链指针 |
| `npm_command` | `npm` | npm 可执行文件 |
| `npm_blacklist` | `[]` | 依赖包名黑名单：命中任一即本次构建失败 |
| `ignore_scripts_default` | `true` | 默认 `--ignore-scripts` 安装；包声明 `run_scripts: true` 除外 |
| `template_poll_interval_seconds` | `0` | 自动拉取模板周期；0 = 不自动拉取 |

### 其余

| 键 | 默认 | 作用 |
|---|---|---|
| `state_dir` | `./state` | 构建状态（build_id、sdk_list、artifact 记录） |
| `serve_artifacts` | `false` | 是否由本服务静态托管 `current_link` 产物；生产为 false，静态站由其他 Web 服务器（如 nginx）托管 |

## 端口与暴露面

| 端口 | 用途 | 暴露 |
|---|---|---|
| `2704`/tcp | API + `/health` | **回环**（部署默认仅 loopback，内部构建服务） |
| `2705`/tcp | 维护操作 | **回环** |

鉴权：`/api/*` 统一要求 `X-Internal-Key` 请求头（值 = 配置 `hrpauth.internal_key`，fail-closed）；`/health` 不鉴权。

数据目录：`./state`、`./artifacts`、`./frontend-build`（生产对应 `/www/wwwroot/sdkh/` 下自管目录）。

## 启动 / 停止 / 升级 / 回滚

- **启动/停止**：面板形态经 aapanel；独立形态直接运行二进制。无数据库、无迁移机制。
- **升级**：替换二进制重启；`state/`、`artifacts/` 保留。
- **回滚**：换回旧二进制；`current` 软链指向的产物不受影响。

## 验证

```sh
# 健康探针（不鉴权）
curl -s http://127.0.0.1:2704/health
# 期望 200

# 构建状态（编排冒烟同款；从未构建时 state=empty 也是正常结果）
curl -s -H "X-Internal-Key: <internal_key>" http://127.0.0.1:2704/api/build/status
# 期望 200，响应含 state 与 sdk_list 字段
```

## 故障对照

| 现象 | 原因 | 处理 |
|---|---|---|
| `/api/*` 全部 401 | `internal_key` 留空（fail-closed）或请求未带 `X-Internal-Key` | 配置密钥并与调用方（HRPAuth）一致 |
| 轮询不到 SDK 包 | HRPAuth 核心不可达或服务凭据错 | 核对 `hrpauth.*`；本服务只认核心这一个来源 |
| 构建失败且提示黑名单 | 依赖合并命中 `npm_blacklist` 包名 | 按提示移除冲突包（黑名单命中即拒绝，与 run_scripts 无关） |
| 模板拉不下来 | `template_dir` 不存在且 Git 克隆失败 | 检查网络/URL，或手工准备本地检出 |
| 产物已发布但站点没更新 | `serve_artifacts: false`，本服务不托管静态站 | 托管方（nginx 等）指向 `current` 软链产物 |
