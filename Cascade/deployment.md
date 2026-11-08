---
title: Cascade 部署者文档
description: Cascade 边缘代理的运行前提、从零部署、配置项表、端口暴露、启停升级、部署验证与故障对照。
order: 1
tags:
  - cascade
  - deployment
updatedAt: 2026-11-08
---

# Cascade — 部署

Cascade 是 Rusted Warfare 群组服务器的边缘反向代理：玩家唯一公网入口，接收客户端连接、按房间码路由到后端、转发原生协议帧，并提供房间目录与 `/goto` 跳服。后端是独立的 Avalon 实例；房间与对局行为由后端负责。

## 运行前提

| 项 | 要求 |
|---|---|
| 运行时 | Go 1.26.10+ 构建的静态二进制（`go.mod`）；数据库迁移 SQL 已 `go:embed` 编入二进制（`internal/database/migrate.go::migrationsFS`），任意工作目录可启动，无需随附迁移目录 |
| 数据库 | SQLite（默认，`db_path`）或 MySQL（`mysql_dsn`） |
| Redis | 可选（玩家认证缓存：`redis_addr` 等） |
| HRPAuth | 可选（玩家认证/认领：`hrpauth_url` 等） |
| 后端 | 必需：至少一个 Avalon（`backends` + `default_backend_id`，见 [Avalon 部署者文档](../Avalon/deployment.md)） |
| 签名密钥 | 必需：Ed25519 PKCS#8 私钥（`proxy_private_key_path`，权限 0600） |
| mTLS 材料 | 仅当存在 `pinned`/`mtls` 传输的后端：`backend_client_cert` / `backend_client_key`（0600）/ `backend_ca_pool` |
| 进程监督 | 编排形态归 Tinyvisor（`deploy-manifest.yaml` 声明 `manager: tinyvisor`，`restart_policy: unless-stopped`、`auto_start: true`） |

版本号仓库未声明（无版本 tag；`config.go` 的 `configVersion=2` 是配置 schema 版本，不是服务版本）。

## 从零部署

```sh
go build -o build/cascade ./cmd/cascade

# 运行目录
mkdir -p data
openssl genpkey -algorithm ed25519 -out proxy-ed25519-key.pem
chmod 600 proxy-ed25519-key.pem
cp config.example.yaml config.yaml
# 编辑 config.yaml：default_backend_id、backends、proxy_private_key_path
./build/cascade        # 首次试运行也可 go run ./cmd/cascade
```

- `config.yaml` 不存在时首启自动生成默认配置（**不含后端**）；默认后端与签名密钥必须启动前配置，程序不自动猜测后端地址。
- 配置从 v1 自动迁移到 v2（玩家表结构与认证绑定保留）。
- 相对路径先按工作目录、再按可执行文件所在目录解析；已存在的 `config.yaml` 与 `db_path` 从任一位置读取，新文件创建在工作目录。
- 从 MCAGS-RW 升级：默认 SQLite 路径已改为 `data/cascade.db`（旧库 `data/rwgin.db` 需迁移或显式设置 `db_path`）；`proxy_issuer`、`hrpauth_service_name` 与后端 preamble magic 均已变更，需与后端同步更新并重新签发令牌。

## 配置项表

配置在 `config.yaml`（schema `version: 2`），启动时读取；仓库未声明热加载机制，改动重启生效。全部键以 `config.example.yaml` 为准：

### 监听与存储

| 键 | 默认 | 作用 |
|---|---|---|
| `version` | 2 | 配置 schema 版本 |
| `game_listen_addr` | ":5123" | 游戏 TCP 监听（RW 客户端连入） |
| `http_listen_addr` | ":8080" | 管理/门面 HTTP 监听 |
| `db_type` | "sqlite" | sqlite 或 mysql |
| `db_path` | "data/cascade.db" | sqlite 时生效 |
| `mysql_dsn` | — | mysql 时的 DSN |
| `redis_addr` / `redis_password` / `redis_db` / `redis_prefix` | — | 可选，玩家认证缓存 |

### 认证与代理行为

| 键 | 默认 | 作用 |
|---|---|---|
| `hrpauth_url` / `hrpauth_client_id` / `hrpauth_client_secret` | — | 可选，HRPAuth 玩家认证/认领 |
| `hrpauth_service_name` | "Cascade" | HRPAuth 服务名 |
| `hrpauth_relay_prefix` | "/rusted-warfare" | HRPAuth relay 前缀 |
| `presence_ttl_sec` | 120 | presence TTL |
| `register_timeout_sec` | 5 | 注册超时 |
| `read_timeout_sec` | 90 | 读超时 |
| `max_connections` | 0 | 连接数上限，0 = 不限制 |
| `chat_rate_limit` | 5 | 聊天速率限制 |

### 后端与传输

| 键 | 默认 | 作用 |
|---|---|---|
| `default_backend_id` | 必填 | 无房间码连接与大厅的落点 |
| `backends[].id` | 必填 | 必须等于后端的 backendId（JWT aud） |
| `backends[].control_url` | 必填 | 后端控制面；明文必须 `http://`，mTLS 必须 `https://` |
| `backends[].game_address` | 必填 | 后端游戏口（只需对代理可达） |
| `backends[].prefixes` | — | 房间码前缀路由 |
| `backends[].trust_mode` | — | 按后端实际配置声明：open / ip / pinned |
| `backends[].tls_mode` | "auto" | auto / mtls / plain；auto 按 trust_mode 推导（open/ip→plain，pinned→mtls，缺失或无法解析→mtls，失败即关闭，绝不静默降级明文）；plain 与 trust_mode pinned 冲突时启动报错 |
| `backends[].jump_port` | — | 代理为该后端额外监听的公开跳转端口（>0 生效） |
| `public_game_host` | "" | vanilla 客户端可达的公网主机名/IP；**留空 = 整体关闭大厅跳转**（`/goto` 被拒绝） |

### 身份与探测

| 键 | 默认 | 作用 |
|---|---|---|
| `proxy_issuer` | "cascade" | 代理 JWT issuer |
| `proxy_key_id` | — | 签名密钥 ID |
| `proxy_private_key_path` | — | Ed25519 PKCS#8 私钥路径（0600） |
| `backend_client_cert` / `backend_client_key` / `backend_ca_pool` | — | 仅 mtls 后端需要；私钥不允许 group/other 可读 |
| `health_interval_sec` | 5 | 后端健康探测间隔 |
| `room_snapshot_interval_sec` | 5 | 房间快照刷新间隔 |
| `pending_session_timeout_sec` | 5 | pending 会话超时 |

注：`jump_port` 与 `public_game_host` 在 `config.example.yaml` 中未列出，字段以 `internal/config/config.go::JumpPort` / `::PublicGameHost` 为准。

## 端口与暴露面

| 端口 | 用途 | 暴露 |
|---|---|---|
| 游戏口（默认 :5123） | RW 客户端连入 | **公网**（玩家唯一入口） |
| 跳转端口（各后端 `jump_port`） | `/goto` 重连落点，直通对应后端 | **公网**（每个需要被跳入的后端一个） |
| 管理 HTTP（默认 :8080） | `/healthz`、`/readyz`、`/api/*` | 仅回环（`deploy-manifest.yaml` 声明 `exposure: loopback`） |

防火墙口径：**只有代理的游戏口与跳转端口对外**；后端游戏口只需对代理可达，不对玩家开放。

## 启动 / 停止 / 升级 / 回滚

- 编排形态：进程归 Tinyvisor，部署/回滚经 HA-Services-Deployer（`POST /api/v1/deploy/run` / `/rollback`）。清单预定安装根 `/www/wwwroot/casc`、二进制 `cascade`；清单注明生产尚未部署，首次实际部署以现场为准。
- 独立运行：`./build/cascade`（读工作目录的 `config.yaml`）；停止 = SIGTERM。
- 升级：替换二进制即可，迁移随启动自动执行。数据库 schema 的回滚语义仓库未声明——回退旧二进制前先确认 schema 兼容性。

## 验证

```sh
curl -s http://127.0.0.1:8080/healthz
# 期望：{"status":"ok"}（进程与 HTTP 面活着）

curl -s http://127.0.0.1:8080/api/backends
# 期望：各后端 healthy、快照、房间归属冲突与解析出的传输方式（mtls/plain）

curl -s http://127.0.0.1:8080/api/rooms
# 期望：200，rooms 非空 = 边缘→后端控制面链路在干活

curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/readyz
# 判据是默认后端 Healthy（要求后端 /v1/health ready）。
# 后端为无 helper 形态时恒 503——形态边界，不是故障
```

## 故障对照

| 现象 | 原因 | 处理 |
|---|---|---|
| `/readyz` 503 | 判据为默认后端 Healthy（后端 `/v1/health` ready）；后端无 helper 形态不可能满足 | 形态边界：改用 `/api/rooms` 非空验证链路；接上 helper 后判据自然满足 |
| 房间已可见，客户端被 "No available backend" 踢回 | 健康要连续两次探测成功，房间快照一次成功即可见，存在启动窗口 | 门控等 `/api/backends` 全 healthy，不要只等房间出现 |
| 启动失败，提示传输冲突 | `tls_mode: plain` 与 `trust_mode: pinned` 冲突，或 control_url 协议与传输不匹配（mtls 须 https、plain 须 http） | 按后端实际信任档改 `trust_mode`/`tls_mode`/URL 协议 |
| `/goto` 被拒绝 | `public_game_host` 留空（整体关闭大厅跳转） | 配置公网可解析可达的 `public_game_host` |
| 跳转后客户端连不上 | 目标后端未声明 `jump_port`，或该端口未对公网开放 | 后端配 `jump_port`，防火墙放行 |
| 管理面错误码看不懂 | 错误信封 `{success,code,message,meta.request_id}`：`lower_snake` 码在 HA-Contract `docs/api/error-codes.md` 登记；后端 `UPPER_SNAKE` 码原样透传 | 按码查契约 |
