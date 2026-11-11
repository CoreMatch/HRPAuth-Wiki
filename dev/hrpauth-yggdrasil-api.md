---
title: HRPAuth-Yggdrasil-API 开发者文档
description: HRPAuth-Yggdrasil-API 的代码结构、Yggdrasil 协议面、与核心的集成和 feature flags。
order: 2
tags:
  - hrpauth-yggdrasil-api
  - development
updatedAt: 2026-11-12
---

# HRPAuth-Yggdrasil-API — 开发

Yggdrasil 兼容 Minecraft 认证服务（2026-10 从 HRPAuth 核心拆分）：对游戏客户端与 authlib-injector 提供标准 Yggdrasil 协议面，游戏域数据归本服务所有，身份校验经 HRPAuth 核心完成。

## 代码结构

```
main.go              入口：配置 → 核心凭据解析 → DB/Redis → 路由 → 后台注册核心
controllers/         yggdrasil（协议面）、register、internal、player、admin、startup
services/            认证、会话、纹理、Mojang 绑定等业务逻辑
models/、database/   游戏域数据模型与迁移（迁移集已压缩，见仓内 knowledge/0005）
redis/               Redis 客户端
clients/             核心 API 客户端（verify-credentials / verify-token）
sdk/                 内嵌 WebUI SDK 包（启动时上传核心）
config/              配置加载
```

## 构建与测试

```bash
go build -o ./build/HAygg   # build.sh 声明的构建命令（Go 1.26.10）
go vet ./...
go test ./...
```

## HTTP 表面

- **Yggdrasil 协议**（游戏客户端直连）：`POST /authserver/authenticate|refresh|validate|invalidate|signout`；`POST /sessionserver/session/minecraft/join`、`GET .../hasJoined`、`GET .../profile/:uuid`；`GET /` 元信息（含 feature flags 回显）。
- **玩家面**：`GET /player`（信息）、`GET|POST /player/profile`（游戏档案）、`/player/mojang-bind-enable|disable`、`/player/skin-sync-enable|disable`。
- **管理面**：`POST /admin/claim-user`、`POST /admin/force-bind`（claim 与强制绑定，见仓内 knowledge/0008）。
- **内部面**：`POST /internal/proxy-register`、`GET /internal/heartbeat`——仅 `X-Internal-Key` 防护，key 在注册时从核心 `POST /services/auth-key` 取得；未配置核心时 key 为空、两端点对一切请求 401（standalone 下按构造失效）。
- **纹理与兼容**：`GET /textures/:hash`、`GET /previews/:fileName`、`GET /texture/avatar/:uuid`、`POST /texture/get`、`POST /texture/upload/:uuid`、`DELETE /texture/delete/:uuid/:type`；legacy `GET /skin/:username`、`GET /skins/MinecraftSkins/:username`。
- **Minecraft 1.19+ profile key**：`POST /minecraftservices/player/certificates`、`GET /minecraftservices/publickeys`（flag 开启后可用）。
- `GET /health` 存活探针（不查库）；`POST /register`；`POST /api/profiles/minecraft` 批量档案；`GET /mojang/profile/:uuid`、`GET /texture/mojang/:uuid`。

## 与 HRPAuth 核心的集成

- 启动凭据解析（`main.go::resolveCoreCredentials`）：`core_api.client_id/client_secret` 若是核心内建 super 客户端，经 `POST /oauth/register`（RFC 7591）换取本服务低权限客户端并丢弃 super 密钥；已是专用客户端则幂等校验复用。任何失败中止启动。
- 认证链：`services/auth_service.go::VerifyCredentials` 先查本地 proxy accounts，再查核心（`/internal/verify-credentials`、`/internal/verify-token`）——核心不可达时仅本地代理账号可登录（standalone 降级）。
- 启动后后台注册核心（presence/relay/internal key）并上传 SDK 包；孤儿纹理每小时清理一次。

## Feature flags

`yggdrasil.feature_flags.*`（契约仓 knowledge 回迁件，仓内 knowledge/0011）：`non_email_login`（默认 true，允许档案名登录）、`legacy_skin_api`（true）、`no_mojang_namespace`（false）、`enable_mojang_anti_features`（false）、`enable_profile_key`（false）、`username_check`（true，强烈建议保持）、`enable_ip_check`（false）。

## 契约与边界

- 对外契约：HA-Contract `docs/api/openapi/hrpauth-yggdrasil-business.yaml`；`/health` 等端点注释逐条引用。
- 本服务**不托管皮肤库**：公开皮肤浏览在 WebUI 的 Skinlib 页（后端是 HASkinLib）；CSL 协议转换在 HASkinProxy。
- 已知遗留（仓内 knowledge/0005）：git 历史中的旧密钥对与旧部署命令按已暴露处理；迁移版本高于最高内嵌迁移的数据库被 `EnsureMigrations` 钳到最高版。
