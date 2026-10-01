---
title: 接口总览
description: 按站内业务接口和 Yggdrasil 接口对 HRPAuth 的 HTTP 能力做一页式总览。
order: 6
tags:
  - api
  - http
  - yggdrasil
updatedAt: 2026-09-12
---

# 接口总览

HRPAuth 的接口可以分成两大类：站内业务接口和 Yggdrasil 接口。

## 站内业务接口

### 服务状态

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/status` | 查看服务在线状态、版本和时间 |

### 认证 (OAuth2)

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/oauth/login-ticket` | 第一方密码校验；未启用 TOTP 时直接签 OAuth2 token，启用时返回 `login_ticket` |
| `GET` | `/oauth/authorize` | 校验 `authorization_code + PKCE` 请求 |
| `POST` | `/oauth/authorize/decision` | 完成交互式授权并签发 authorization code |
| `POST` | `/oauth/token` | OAuth2 token 端点 (支持 authorization_code, refresh_token, client_credentials) |
| `POST` | `/oauth/revoke` | 撤销 OAuth2 access token |
| `POST` | `/register` | 用户注册；服务代注册现需 Bearer 服务 token |
| `GET` | `/logout` | 撤销当前 Bearer access token |

### 用户与资料

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `POST` | `/user` | Bearer | 获取用户基础信息 |
| `DELETE` | `/user` | Bearer | 申请注销账号（进入冷静期并使令牌失效） |
| `GET` | `/user/deleted` | Service Bearer | 获取当前处于冷静期的账号列表 |
| `POST` | `/user/declare-email` | Service Bearer | 为指定用户声明邮箱 |
| `POST` | `/user/mojang-bind-enable` | Bearer | 开启 Mojang 绑定许可（15 分钟自动过期） |
| `POST` | `/user/mojang-bind-disable` | Bearer | 关闭 Mojang 绑定许可 |
| `POST` | `/user/lookup` | 无 | 根据 `uid` 查用户名，或根据 `username` 查 UID（二选一） |
| `POST` | `/change-username` | Bearer | 修改站内用户名 |
| `POST` | `/change-profile-name` | Bearer | 修改 Minecraft 角色名 |

### 运维管理

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `POST` | `/admin/claim-user` | Service Bearer（`user.claim.as-service`） | 为代注册用户（`cbh=0`）指派真实邮箱和密码，并翻转 `cbh=1` |
| `POST` | `/admin/force-bind` | Service Bearer + Manage Token | 将代注册账号的 `mojang_uuid` 转移到手动注册账号，并删除代注册账号 |

### 验证与安全

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `POST` | `/email-verification` | 见详情 | 发送验证码、校验验证码等 |
| `POST` | `/totp/setup` | Bearer | 配置 TOTP |
| `POST` | `/totp/verify` | Login Ticket | 校验 TOTP 动态码并换取 OAuth2 Token |
| `POST` | `/totp/toggle` | Bearer | 开启或关闭双因素认证 |
| `POST` | `/totp/hasbeenenabled` | Bearer | 查询是否已开启 TOTP |
| `POST` | `/captcha` | 无 | 生成图形验证码 |
| `GET` | `/captcha/enabled` | 无 | 查询是否启用图形验证码 |
| `GET` | `/captcha/image/:token` | 无 | 拉取验证码图片 |

### 密钥与纹理

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `POST` | `/generate-key` | 无 | 生成 RSA 密钥对 |
| `POST` | `/texture/upload` | Bearer | 上传皮肤或披风 |
| `POST` | `/texture/delete` | Bearer | 删除纹理 |
| `POST` | `/texture/get` | Bearer | 获取纹理信息 |
| `POST` | `/texture/rewrite-callback` | Manage Token | 批量重写所有材质 URL 为当前 `callback.url`（支持 `dry_run` 预览） |
| `GET` | `/texture/mojang/:uuid` | 无 | 传入 Mojang UUID，由后端从 Mojang 拉取材质并以 PNG 二进制返回（支持 `?type=cape`） |
| `GET` | `/mojang/profile/:uuid` | 无 | 传入 Mojang UUID，由后端从 Mojang Session Server 获取玩家 Profile（id、name、是否有披风），不下载材质 |

---

## Yggdrasil 接口

这些接口由 Minecraft 客户端直接调用，遵循 Yggdrasil 协议规范。

### authserver

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/authserver/authenticate` | 用户认证，签发或复用 `accessToken` |
| `POST` | `/authserver/refresh` | 刷新并重建会话；响应不再包含 `availableProfiles` |
| `POST` | `/authserver/validate` | 校验 Token 是否仍有效 |
| `POST` | `/authserver/invalidate` | 使当前 Token 失效 |
| `POST` | `/authserver/signout` | 注销账号下的全部 Yggdrasil Token（与 `/authenticate` 共享速率限制） |

### sessionserver

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/sessionserver/session/minecraft/join` | 写入加入服务器会话 |
| `GET` | `/sessionserver/session/minecraft/hasJoined` | 校验玩家是否已加入服务器 |
| `GET` | `/sessionserver/session/minecraft/profile/:uuid` | 查询角色资料 |

### 角色与纹理

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `POST` | `/api/profiles/minecraft` | 无 | 按名称批量查询角色 |
| `PUT` | `/api/user/profile/:uuid/:textureType` | `Authorization: Bearer <accessToken>` | 上传皮肤或披风 |
| `DELETE` | `/api/user/profile/:uuid/:textureType` | `Authorization: Bearer <accessToken>` | 删除皮肤或披风 |
| `GET` | `/textures/:hash` | 无 | 下载材质 PNG |
| `GET` | `/skins/MinecraftSkins/:username` | 无 | 旧版皮肤下载（受 `legacy_skin_api` 控制） |

### 元信息

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/` | Yggdrasil 元信息（meta、skinDomains、signaturePublickey），同时携带 `X-Authlib-Injector-API-Location: /` 响应头 |

### Minecraft Services (Profile Key)

仅当 `yggdrasil.feature_flags.enable_profile_key = true` 时启用：

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `POST` | `/minecraftservices/player/certificates` | `Authorization: Bearer <accessToken>` | 颁发或返回当前用户的聊天签名密钥对 |
| `GET` | `/minecraftservices/publickeys` | 无 | 获取验证服务器的签名公钥（Mojang 信封格式） |

> Profile Key 的密钥对是 RSA 2048，持久化在 `profile_keys` 表中，有效期 48 小时。详细规范参见 [Profile Keys](./profile-keys)。

---

## 核心集成建议

### 1. 站内业务集成
现在统一使用 `Authorization: Bearer <token>` 头部。不要再尝试从 Cookie 中读取 `remember_token` 传递给后端。

### 2. 登录与 TOTP 配合
第一方 WebUI 应先调 `/oauth/login-ticket`。如果后端返回 `totp_required: true`，则进入动态码输入环节，最后调用 `/totp/verify`。

### 3. Yggdrasil 隔离
记住站内 OAuth2 Access Token 与 Yggdrasil Access Token 是两套系统，不可混用。

### 4. Token 数量上限
`yggdrasil.security.max_tokens_per_user`（默认 10）约束单个用户最多持有的有效 `accessToken` 数量。详见 [Token 与鉴权体系](./token-system)。
