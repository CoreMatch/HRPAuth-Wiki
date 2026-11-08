---
title: HASkinProxy 开发者文档
description: HASkinProxy 的代码结构、路由与缓存机制、上游集成与构建。
order: 2
tags:
  - haskinproxy
  - development
updatedAt: 2026-11-08
---

# HASkinProxy — 开发

## 代码结构

```
main.go              入口：配置 → 上游客户端 → 缓存 → 路由
internal/
  cache/             freecache 内存缓存（玩家信息与材质两级 TTL）
  config/            配置加载
  handler/           CSL 协议处理器
  hrpauth/           上游 Yggdrasil 客户端与 OAuth2 凭据换取
  model/             数据模型
  router/            路由注册
sdk/、sdkdata.go、sdk_upload.go    SDK 包数据与上传
```

## 构建与测试

```bash
go build -o build/hasp .     # 构建命令仓库未单独声明，产物路径按部署清单
go vet ./...
go test ./...
```

## 路由与机制

- `GET /health`：存活探针。
- `GET /{username}`：CSL profile 查询——经上游 Yggdrasil 接口（`/api/profiles/minecraft`、`/sessionserver/session/minecraft/profile/{uuid}`）转换后按 CSL 协议应答。
- `GET /textures/{hash}`：纹理转发。
- 缓存：freecache 内存级，`profile_ttl`（默认 3600s）与 `texture_ttl`（默认 86400s）分级，`max_size_mb` 封顶。
- 凭据：启动时按 `upstream.client_id/client_secret` 的填写形态决定路径——super 凭据走 `POST /oauth/register` 换取低权限客户端，专用凭据走幂等校验（详见部署者文档的配置表）。
- presence：`presence.name`（HASkinProxy）自报，供 HRPAuth 服务发现；`sdk.enabled` 控制 SDK 包集成。
