---
title: HRPAuth 部署者文档
description: HRPAuth 认证核心的运行前提、从零部署、配置项表、端口、启停升级、验证与故障对照。
order: 1
tags:
  - hrpauth
  - deployment
updatedAt: 2026-11-08
---

# HRPAuth — 部署

通用认证核心服务，HA 生态的 OAuth2 授权中心：账号、登录、多因素安全，并为生态内其他服务提供 OAuth2 授权。Yggdrasil 协议与皮肤/纹理能力不在本服务——2026-10-06 已拆分为 HRPAuth-Yggdrasil-API、HASkinLib、HASkinProxy。

## 运行前提

| 项 | 要求 |
|---|---|
| 构建 | Go 1.26+（`go.mod` 为 1.26.10） |
| MySQL | 必需（`deploy-manifest.yaml` 依赖声明 required）；迁移随启动自动执行（`mode: auto_on_startup`） |
| Redis | 必需（依赖声明 required） |
| SMTP | 必需（验证邮件发信） |
| 进程管理 | 面板管理（`manager: aapanel`，安装根 `/www/wwwroot/ha`，二进制 `HRPAuth`） |

清单声明的服务版本为 `62526`（仓库无版本 tag，此为清单记录值）。

## 从零部署

```bash
git clone https://github.com/CoreMatch/HRPAuth.git
cd HRPAuth

# 首次运行：自动生成 config.yaml（只生成配置，不生成任何密钥或证书）
go run main.go

# 编辑 config.yaml 必改字段：database、redis、smtp、server.port、callback.url、frontend.url
go build -o HRPAuth      # 或 ./build.sh（= go build -o ./build/HRPAuth）
./HRPAuth
```

- `build/` 下保留六个平台的预编译产物：darwin / linux / windows × amd64 / arm64。
- 容器：`docker build -t hrpauth .`——非 root 用户运行，暴露端口 2778；入口脚本（`docker-entrypoint.sh`）可在启动前用环境变量渲染配置模板（`CONFIG_TEMPLATE` / `RENDERED_CONFIG`）。
- 平台编排：整平台由 HA-Services-Deployer 的 `deploy/docker-compose.yml` 统一编排，MySQL/Redis 由外部 `.env` 提供。

## 配置项表

配置在 `config.yaml`，首启自动生成默认值；改动**重启生效**。配置带 `version` 字段，启动时按版本链迁移（`config/migrations.go`）：缺 version 字段直接报错；版本新于代码时告警且不改文件。部署模板当前为 `version: "15"`（清单 `template_version` 记为 "14"，存在漂移，以模板为准）。

| 段.键 | 默认/示例 | 作用 |
|---|---|---|
| `version` | "15" | 配置 schema 版本 |
| `server.port` | `:2778` | 监听地址 |
| `server.cors_origin` | "*" | CORS 来源 |
| `database.host` / `database.port` | — | MySQL 主机与端口（v12 起 host 只放主机名） |
| `database.db_name` / `database.user` / `database.password` | — | 数据库名与凭 |
| `database.charset` | utf8mb4 | 字符集 |
| `database.retry_interval_sec` | 3 | 连接失败重试间隔 |
| `database.max_retries` | 5 | 单轮最大重试次数 |
| `database.next_round_delay_min` | 5 | 轮间等待分钟数（0 = 不再重试） |
| `redis.host` / `redis.port` / `redis.password` / `redis.db` | — | Redis 连接 |
| `redis.prefix` | hrpauth_ | 键前缀 |
| `verification_code.code_ttl` | 600 | 验证码有效期（秒） |
| `verification_code.storage_dir` | ./cache/verification_codes | 验证码存储目录 |
| `security.enable_captcha` | true | 验证码开关 |
| `security.captcha_ttl` | 300 | 验证码 TTL（秒） |
| `security.password_cost` | 10 | bcrypt cost |
| `security.rate_limit_max_attempts` / `rate_limit_window_sec` | 10 / 600 | 限流 |
| `smtp.host` / `smtp.port` / `smtp.username` / `smtp.password` | — | SMTP 发信；**port 必须是无引号数字**（带引号解析成 0，拨号变 "host:0" 直接失败） |
| `smtp.from_email` / `smtp.from_name` | — / HRPAuth | 发件人 |
| `callback.url` | — | 对外回调地址（必改） |
| `frontend.url` | — | 前端地址（必改；oauth2 回调由其派生） |
| `manage.token` | — | 管理接口凭据 |
| `oauth2.issuer` | — | 签发者（通常为对外地址） |
| `oauth2.access_token_ttl_sec` / `authorization_code_ttl_sec` / `refresh_token_ttl_sec` | 3600 / 300 / 2592000 | 令牌 TTL |
| `oauth2.public_client_id` / `public_redirect_uris` | — | 公共客户端 |
| `oauth2.super_client_id` / `super_client_secret` / `super_client_extra_scopes` | — / — / [] | 内置超级客户端 |
| `oauth2.service_clients` | 种子列表 | 服务客户端种子：启动时幂等登记（confidential / client_credentials）；已存在的行不覆盖，secret 漂移只告警 |
| `oauth2.service_scope_allowlist` | 按 presence 名 | 自助注册（`POST /oauth/register`，仅 super client 可发起）的 scope 允许列表 |

## 端口与暴露面

| 端口 | 用途 | 暴露 |
|---|---|---|
| 2778 | 服务主端口（用户/游戏面） | 公网（`deploy-manifest.yaml` 声明 `exposure: public`） |

## 启动 / 停止 / 升级 / 回滚

- 生产为面板管理（`manager: aapanel`）：启停升级按面板操作；编排器只读不碰。
- 非面板：直接运行二进制；停止 = SIGTERM。
- 升级：替换二进制重启；数据库迁移随启动自动执行（golang-migrate）。
- 回滚：换回旧二进制。注意迁移方向性——回滚前确认旧版本能兼容当前 schema，仓库未声明降级迁移机制。

## 验证

```sh
curl -s http://127.0.0.1:2778/health
# 期望：200，{"status":"ok"}

# 冒烟（编排器同款）：客户端凭据换令牌
curl -s -X POST http://127.0.0.1:2778/oauth/token \
  -H 'Content-Type: application/json' \
  -d '{"grant_type":"client_credentials","client_id":"<id>","client_secret":"<secret>"}'
# 期望：200，响应含非空 access_token
```

## 故障对照

| 现象 | 原因 | 处理 |
|---|---|---|
| 数据库连不上时服务反复重试后长等 | 按 `retry_interval_sec`×`max_retries` 重试，失败后等 `next_round_delay_min` 分钟进入下一轮（0 = 不再重试） | 检查 MySQL 可达性与凭据 |
| 发信失败，日志拨号 "host:0" | `smtp.port` 写成了带引号的字符串，被解析成 0 | port 写成无引号数字 |
| 启动报缺 version 字段 | 配置文件没有 `version` | 按报错补 `version`（或恢复备份） |
| 配置版本新于二进制 | 用旧二进制跑了新配置 | 升级二进制；文件不会被改动（只告警） |
| 某服务种子客户端没建出来 | `service_clients` 条目的 secret 填成了 super secret（防呆：跳过并告警） | 该服务走自助注册拿独立 secret，或修正种子凭据 |
