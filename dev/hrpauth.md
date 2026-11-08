---
title: HRPAuth 开发者文档
description: HRPAuth 的代码结构、构建与测试、OAuth2 扩展点与契约、数据形态与配置迁移规则。
order: 2
tags:
  - hrpauth
  - development
updatedAt: 2026-11-08
---

# HRPAuth — 开发

## 代码结构

```
main.go            启动链：配置 → 数据库（异步初始化 + 连接后迁移/客户端登记）→ Redis → 路由
config/            配置解析与版本迁移链（config.go、migrations.go）
controllers/       HTTP 处理器
models/            数据模型
database/          MySQL/GORM 连接与重试（database.go）
redis/             Redis 客户端
clients/           外部客户端
build/             六平台预编译产物（darwin/linux/windows × amd64/arm64）
```

## 构建与测试

```bash
./build.sh           # = go build -o ./build/HRPAuth
go vet ./...
go test ./...
```

## 扩展点与契约

- 健康端点：`GET /health` → `{"status":"ok"}`（`main.go`）。
- OAuth2：`POST /oauth/token`（client_credentials 等）；`POST /oauth/register` 自助客户端注册——**仅内置 super client 可发起**，scope 受 `oauth2.service_scope_allowlist` 按 presence 名约束。
- 服务客户端种子：`oauth2.service_clients` 启动时幂等登记（confidential / client_credentials / 非 super）；已存在的行不覆盖，secret 漂移只告警需人工对账。种子 `client_id` 与各服务 presence 自报名逐字一致（WinnerProxy / HRPAuth-Yggdrasil-API / HASkinProxy），因此自助注册 get-or-create 直接命中种子行。
- 管理面：`manage.token` 凭据。
- 外部契约以 HA-Contract 为准（`docs/api/` 错误码与 API 标准）。

## 数据形态与迁移

- MySQL：数据库迁移随启动自动执行（`database/database.go` 连接成功后注册回调；golang-migrate）。
- Redis：键前缀 `hrpauth_`。
- 磁盘：`data/sdk_packages`、`cache/verification_codes`（验证码存储）。
- 连接重试：按 `retry_interval_sec` × `max_retries` 重试，失败后等 `next_round_delay_min` 分钟进入下一轮（0 = 不再重试）。

## 配置版本兼容规则

配置迁移链在 `config/migrations.go`（从旧到新顺序登记，各自幂等）：

- 文件版本等于代码 `ConfigVersion`：无操作。
- 旧于代码：按链逐级迁移；任一步出错即中止。
- 新于代码：告警并保持文件不动。
- 缺 `version` 字段：报错退出，要求补字段或恢复备份。
