---
title: Cascade 开发者文档
description: Cascade 的代码结构、构建与测试、路由与跳转机制、后端契约与传输推导、数据形态与配置迁移。
order: 2
tags:
  - cascade
  - development
updatedAt: 2026-11-08
---

# Cascade — 开发

## 代码结构

```
cmd/cascade/           程序入口
embed.go               内嵌 sdk/* 资源（SDKFS）
internal/
  api/                 管理/门面 HTTP（/healthz、/readyz、/api/backends、/api/rooms）
  app/                 启动装配
  auth/                玩家认证与 JWT 身份绑定
  backend/             后端目录：健康、房间快照、路由归属
  config/              配置加载与 v1→v2 迁移
  database/            GORM 存储；迁移 SQL 经 go:embed 编入二进制
  i18n/                文案
  paths/               路径解析（工作目录 → 可执行文件目录）
  protocol/            RW 原生协议帧
  proxy/               会话路由、聊天命令（/goto、/rooms）、跳转监听
  redis/               可选认证缓存
```

## 构建与测试

```bash
go build -o build/cascade ./cmd/cascade
go vet ./...
go test ./...
```

仓内测试覆盖：配置迁移、OpenAPI YAML 解析、路由目录、按信任档推导的明文与 mTLS 控制/游戏传输、JWT 身份绑定、RW 帧转发。测试不等同于真实客户端兼容验收——正式切换前仍需独立后端 + 真实 Rusted Warfare 客户端完成握手、入房与一整局。

## 路由机制

- 初始 `Preregister` 带房间码时，路由优先级：**已知房间归属 → 最长匹配静态前缀 → 默认后端**；无房间码用默认后端。连接选定后端后不再迁移（之后输入的房间码由已选后端处理）。
- `/goto <房间码>` 与 `/rooms` 是代理侧聊天命令，代理直接应答（`internal/proxy/session.go::commandGoto`、`internal/proxy/session.go::commandRooms`）。
- 跳转：`/goto` 解析房间码到所属后端，回 `PACKET_RECONNECT_TO`，目标 = `public_game_host` + 该后端 `jump_port`（`internal/config/config.go::PublicGameHost`、`::JumpPort`）；跳转监听器对落点连接直通该后端，不看房间码（`internal/proxy/server.go::Run`）。后端真实地址从不下发。
- 健康判定：连续两次探测成功才置 healthy（`internal/backend/directory.go::recordHealthResult`，对称地连续三次失败判不健康）；房间快照一次成功即可见——两条时间线不同步。

## 后端契约与传输推导

- 契约权威：HA-Contract `docs/dev/Cascade/Cascade-Backend-v1.md` + `docs/api/openapi/cascade-backend-v1.yaml`。本仓不实现生产后端。
- 传输推导（契约 v1.2）：每后端 `trust_mode`（open/ip/pinned）声明后端信任档，`tls_mode`（auto/mtls/plain）决定是否覆盖；`auto` 按 trust_mode 推导（open/ip→plain，pinned→mtls），缺失或无法解析时按最安全可用档走 mTLS，失败即关闭，绝不静默降级明文。
- 传输决定后校验 `control_url` 协议：mtls 必须 `https://`，plain 必须 `http://`。
- 身份：代理三档都照常签发 JWT（`proxy_issuer`/`proxy_key_id`/Ed25519），后端按档位决定是否验签；会话绑定走控制面 `PUT /v1/sessions/{sid}/identity`（jti 一次性消费）。
- 管理面错误信封：`{"success":false,"code":...,"message":...,"meta":{"request_id":...}}`；`lower_snake` 稳定码登记于 HA-Contract `docs/api/error-codes.md`，后端 `UPPER_SNAKE` 码原样透传。

## 数据形态与迁移

- 存储：SQLite（默认 `data/cascade.db`）或 MySQL；GORM 存储 `internal/database/gorm_store.go::NewGORMStore` 启动时自动执行迁移（`RunMigrationsForDB`）。
- 迁移 SQL 经 `go:embed` 编入二进制（`internal/database/migrate.go::migrationsFS`，`//go:embed migrations/sqlite/*.sql migrations/mysql/*.sql`）：单文件产物自带全部迁移，任意工作目录可启动。
- 配置 v1→v2 自动迁移：玩家表结构与认证绑定保留。
