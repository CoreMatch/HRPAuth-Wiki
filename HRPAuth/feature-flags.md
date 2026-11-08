---
title: 功能开关
description: Yggdrasil 协议层相关功能开关的含义、默认行为与调试影响。
order: 8
tags:
  - feature-flags
  - yggdrasil
  - config
updatedAt: 2026-09-07
---

# 功能开关

HRPAuth 的功能开关主要位于 `yggdrasil.feature_flags` 下，影响的是协议兼容层，而不是站内业务层。

## 当前主要开关

| 配置项 | 作用 |
| --- | --- |
| `non_email_login` | 允许用邮箱之外的角色名走 Yggdrasil 登录 |
| `legacy_skin_api` | 兼容旧版皮肤 API |
| `no_mojang_namespace` | 关闭 Mojang 命名空间 |
| `enable_mojang_anti_features` | 暴露 Mojang 反作弊相关特性 |
| `enable_profile_key` | 启用 profile key 相关能力 |
| `username_check` | 开启用户名格式检查 |
| `enable_ip_check` | 对 `hasJoined` 增加 IP 校验 |

## 开关逐项说明

### `non_email_login`

开启后，Yggdrasil 登录既可以用邮箱，也可以用角色名。对开发者来说，这个开关最直接的影响是：

- `POST /authserver/authenticate` 的入参语义变宽
- 通过角色名登录时，系统会尝试把请求映射回对应用户

它不影响站内业务流程。

### `legacy_skin_api`

这是兼容旧客户端或历史生态的开关。**默认开启**。开启后，`GET /skins/MinecraftSkins/{username}.png` 会按用户名解析并返回 SKIN PNG；关闭时直接返回 `404 NotFoundException`。现代站内纹理管理走的是 Yggdrasil `/api/user/profile/...`，不依赖这个开关。

### `no_mojang_namespace`

影响资料属性里的命名空间格式。如果你在和客户端、皮肤站或其他实现对接时发现字段命名不一致，可以优先回来看这个配置。

### `enable_mojang_anti_features`

这个开关主要是协议兼容表达，实际效果更多取决于客户端如何解释这些元信息。

### `enable_profile_key`

如果你准备兼容 Minecraft 1.19+ 客户端（聊天签名），需要把这个开关打开。开启后：

- `POST /minecraftservices/player/certificates` 颁发或返回当前用户的聊天签名密钥对（RSA 2048，持久化在 `profile_keys`）。
- `GET /minecraftservices/publickeys` 返回签名公钥（Mojang 信封格式）。
- `/authserver/*` 之外多了 `/minecraftservices/*` 一组路径。

> 不开启时仍然可以认证登录，只是 1.19+ 客户端的聊天消息将没有数字签名。详细字段与轮换策略参考 [Profile Keys](./profile-keys.md)。

### `username_check`

建议保持开启。它会限制 Minecraft 角色名格式，能提前拦掉不少脏数据。

### `enable_ip_check`

开启后，`GET /sessionserver/session/minecraft/hasJoined` 会校验查询参数里的 IP 和会话记录中的 IP 是否一致。不一致时会拒绝通过。

## 在元信息接口中的表现

`GET /` 返回的 Yggdrasil 元信息里，会把一部分功能开关直接带回去。这意味着你可以通过读取元信息接口，快速确认当前实例暴露给客户端的特性组合。

## 和站内业务开关的边界

不要把这里和顶层 `security` 混在一起：

- `security.*`：站内业务安全行为，例如验证码、密码成本、限流
- `yggdrasil.feature_flags.*`：协议兼容和 Yggdrasil 行为

## 调试建议

### 登录行为和预期不一致

先看 `non_email_login`。

### `hasJoined` 在某些环境间歇失败

先看 `enable_ip_check` 是否开启，以及代理层是否正确传递客户端 IP。

### 资料属性格式和客户端预期不一致

先看 `no_mojang_namespace` 和 `enable_profile_key`。
