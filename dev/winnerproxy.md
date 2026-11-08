---
title: WinnerProxy 开发者文档
description: WinnerProxy 的分发器设计、代码结构、上游配置与构建。
order: 2
tags:
  - winnerproxy
  - development
updatedAt: 2026-11-08
---

# WinnerProxy — 开发

## 代码结构

```
main.go              入口
internal/
  cache/             内存缓存（大小与 TTL 由配置控制）
  handler/           请求处理器
  hrpauth/           HRPAuth 凭据换取/校验客户端
  proxy/             分发与上游转发
  router/            路由绑定
sdk/、sdkdata.go、sdk_upload.go    SDK 包数据与上传
```

## 构建与测试

```bash
go build -o build/winnerproxy .   # 构建命令仓库未单独声明，产物路径按部署清单
go vet ./...
go test ./...
```

## 分发器设计

- 核心是按账号来源分发请求：不同来源的玩家走不同上游（设计记录见本仓 `knowledge/0001-service-scope-dispatcher.md`）。
- Mojang 官方上游（`upstreams.official`，默认 https://api.minecraftservices.com）**仅在 hasJoined 阶段**使用，`enabled` 开关控制是否启用。
- HRPAuth-Yggdrasil-API 上游（`upstreams.hrpauth`）承担其余转发；与 `hrpauth` 段共用同一对 client 凭据变量。
- 凭据路径与 HASkinProxy 同构：super 凭据启动换取低权限客户端（client_id = presence 名 WinnerProxy），专用凭据走幂等校验。
- 对外行为契约以 HA-Contract 为准（`docs/api/` 与错误码表）。

## 数据形态

- 无数据库、无 Redis：内存缓存（`cache.size` 默认约 100MB、`cache.ttl_sec` 默认 300）。
- 会话状态不持久化；重启后缓存清空。
