---
title: HRPAuth-Yggdrasil-API 部署者文档
description: Yggdrasil-API 的运行前提、二进制与 Docker 部署、配置项表、端口暴露、验证与故障对照。
order: 1
tags:
  - yggdrasil
  - deployment
updatedAt: 2026-11-08
---

# HRPAuth-Yggdrasil-API — 部署

HRPAuth-Yggdrasil-API 是 HRPAuth 生态的 Yggdrasil 兼容 Minecraft 认证服务：对游戏客户端提供标准 Yggdrasil 协议面（兼容 authlib-injector），账号校验与生态集成对接运行中的 HRPAuth 核心。

## 运行前提

| 项 | 要求 |
|---|---|
| Go | 源码构建需要：`go.mod` 声明 `go 1.26.10`（README 写 1.26.4+，以 go.mod 为准）；或用 Docker |
| MySQL | 必需（启动硬依赖）；**先建库建用户**，表在启动时自动创建 |
| Redis | 必需 |
| HRPAuth 核心 | 配置了 `core_api` 凭据时启动期必需（启动期凭据解析任何失败即中止）；运行期常规用户认证与 WebUI 集成也必需。只有 `core_api` 凭据留空时才可无核心启动，此时仅内部登记的代理账号可认证 |
| 进程监督 | 生产声明为 `manager: aapanel`（面板管理，编排器只读） |

## 从零部署（二进制）

```sh
./build.sh                    # 产物 build/HAygg
./build/HAygg                 # 首次运行：在二进制旁生成 config.yaml 与 RSA 签名密钥对
# 停止，编辑 config.yaml，再启动
./build/HAygg
```

**配置文件与生成的密钥对必须与二进制留在同一目录**。生产在位：`/www/wwwroot/hay/HAygg`（deploy-manifest）。

## 从零部署（Docker）

```sh
docker build -t hrpauth-yggdrasil-api .
docker run -d --name yggdrasil-api \
  -p 2770:2770 \
  -v /path/to/config.yaml:/app/config.yaml \
  -v ygg-storage:/app/storage \
  hrpauth-yggdrasil-api
```

- 镜像**不带** `config.yaml`，挂载到 `/app/config.yaml`（挂载可写目录首次运行也可生成）；
- 或用 `CONFIG_TEMPLATE` + `RENDERED_CONFIG` 在容器启动时经 envsubst 渲染配置（`docker-entrypoint.sh`）；
- 纹理存于 `/app/storage`。

## 配置项表

配置文件 `config.yaml`（模板版本 4；低版本启动时自动迁移——仓内示例文件还是 version "3"，启动自动升到 4，补 `database.port` 字段）。生产必须修改的字段：

| 字段 | 含义 |
|---|---|
| `core_api.base_url` | HRPAuth 核心地址，如 `http://localhost:2778` |
| `core_api.client_id` / `core_api.client_secret` | 核心服务 API 的 OAuth2 凭据（与 MCA-Server 的 `service_client_*` 同源：内置 super client） |
| `database.host` / `db_name` / `user` / `password` | MySQL 连接（库必须已存在）；`port` 为 0 时端口内联在 host 里 |
| `redis.host` / `redis.port` | Redis 连接 |
| `microservice.relay_url` | 本服务从 HRPAuth 核心可达的 URL |
| `callback.url` | 纹理 URL 使用的公网基址；留空则从核心站点元数据推导 |

其余段（默认值见仓内 `config.yaml.example`）：

| 段 | 关键键 |
|---|---|
| `server` | `port`（默认 `:2770`）、`cors_origin` |
| `database` | `charset` utf8mb4、`table_prefix` `haygg_` |
| `redis` | `db`、`prefix` `hrpauth_ygg_` |
| `microservice` | `name`、`relay_path_prefix`（`/yggdrasil-api`）、`ttl_seconds`（120）、`profile_cards` |
| `security` | `rate_limit_max_attempts`（10）、`rate_limit_window_sec`（600） |
| `site` | `name` / `implementation` / `version`（状态页展示） |
| `yggdrasil.feature_flags` | `legacy_skin_api`、`non_email_login`、`username_check`、`enable_profile_key`、`enable_ip_check`、`enable_mojang_anti_features`、`no_mojang_namespace` |
| `yggdrasil.security` | `session_expiry_seconds`（28800）、`token_expiry_days`（15）、`max_tokens_per_user`（10）、纹理尺寸/大小上限（1024×1024、512000 字节） |
| `yggdrasil.server` | `signature_private_key_path` / `signature_public_key_path`（首启自动生成）、`skin_domains`（留空默认站点域）、`textures_storage`（`./storage`）、`links` |

## 端口与暴露面

| 端口 | 用途 | 暴露 |
|---|---|---|
| `2770`/tcp（`server.port`） | Yggdrasil 协议面 + 业务端点 + `/health` | 公网（游戏客户端直连；生产建议 HTTPS） |

- 健康探测：`GET /health`（200）。
- 状态页：`GET /`，期望 JSON 含 `"status": "online"`。
- authlib-injector：把注入器（或任何 Yggdrasil 客户端）指向本服务公网 URL 即可。
- 数据目录：`./storage`（textures/previews；**与 HASkinLib 共享同一份纹理存储**）。

## 启动 / 停止 / 升级 / 回滚

- **启动/停止**：面板形态经 aapanel；独立形态直接运行二进制。数据库迁移与配置迁移都在启动时自动执行。
- **升级**：替换二进制重启；`./storage`、`config.yaml` 与密钥对保留。
- **回滚**：换回旧二进制。配置版本高于旧程序支持的主版本时启动拒绝（同主版本内自动迁移）。
- 启动时本服务会把内嵌的 WebUI SDK 包上传到 HRPAuth 核心（SDK 包格式见 HA-Contract `docs/dev/HRPAuth/sdk-package.md`）。

## 验证

```sh
# 状态页
curl -s http://127.0.0.1:2770/
# 期望 200，JSON 含 "status": "online"

# 健康探针
curl -s http://127.0.0.1:2770/health
# 期望 200

# 档案查询链路（编排冒烟同款：全零 UUID 必然查无此人）
curl -s http://127.0.0.1:2770/sessionserver/session/minecraft/profile/00000000-0000-0000-0000-000000000000
# 期望 404，响应含 ProfileNotFoundException——证明查询真的走到了数据库
```

## 故障对照

| 现象 | 原因 | 处理 |
|---|---|---|
| 启动中止于凭据解析 | 配置了 `core_api` 凭据但 HRPAuth 核心不可达/凭据错 | 先确保核心在运行、凭据正确；启动期解析任何失败都中止 |
| 普通玩家无法认证 | HRPAuth 核心运行期不可达 | 恢复核心 |
| 只有代理账号能认证 | `core_api` 凭据留空（无核心形态） | 预期行为；接入核心需补齐凭据 |
| 启动日志配置版本警告 | 配置文件 version 与代码期望不一致 | 同主版本内自动迁移，无需手工处理；跨主版本按提示恢复备份或升级程序 |
| 纹理 URL 不可访问 | `callback.url` 未配置且核心站点元数据推导不符 | 显式配置 `callback.url` 为公网基址 |
