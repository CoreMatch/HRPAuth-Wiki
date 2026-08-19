---
title: Token 与鉴权体系
description: 理解站内 OAuth2、Yggdrasil Token、验证码与 TOTP 的关系与边界。
order: 5
tags:
  - token
  - auth
  - security
updatedAt: 2026-08-15
---

# Token 与鉴权体系

HRPAuth 的复杂度主要来自“一个服务里有多套凭证系统”。如果你先把这些边界理顺，后面的接口行为就会清楚很多。

## 一览表

| 名称 | 主要字段 | 作用范围 | 存储位置 |
| --- | --- | --- | --- |
| OAuth2 Access Token | `Authorization: Bearer <access_token>` | 站内业务接口 | `oauth2_access_tokens` |
| OAuth2 Refresh Token | `refresh_token` | 站内业务续期 | `oauth2_refresh_tokens` |
| OAuth2 Login Ticket | `login_ticket` | TOTP 二步登录中转 | Redis |
| 内置超级客户端密钥 | `oauth2.super_client_secret` | 微服务间通信 | `config.yaml` |
| Yggdrasil Access Token | `accessToken` | Yggdrasil 接口 | `tokens.access_token` |
| Yggdrasil Client Token | `clientToken` | Yggdrasil 客户端标识 | `tokens.client_token` |
| 邮箱验证码 | `code` | 邮箱验证 | Redis |
| 图形验证码 | `captcha_token` + `captcha_code` | 普通注册路径 | Redis |
| TOTP Secret | `totpkey` | 两步验证配置 | `users.totp` |

## 站内业务体系

### OAuth2 Access Token

站内业务接口现在统一改为 OAuth2 Bearer Token。

它主要用于：

- `/logout`
- `/user`
- `/change-username`
- `/change-profile-name`
- `/totp/setup`
- `/totp/hasbeenenabled`
- `/texture/*`
- `/user/declare-email`
- 服务模式 `/register`

### OAuth2 Login Ticket

为了避免把 TOTP 退化成“邮箱 + 动态码就能登录”，第一方登录现在分两步：

1. `POST /oauth/login-ticket` 先做密码校验
2. 若用户已开启 TOTP，则返回短期 `login_ticket`
3. `POST /totp/verify` 再用 `login_ticket + passcode` 直接签发 OAuth2 token

### Legacy Manage Token

`manage.token` 现在只保留为兼容迁移用的旧配置。

新的微服务通信应该使用：

- `oauth2.super_client_id`
- `oauth2.super_client_secret`
- `client_credentials`

## Yggdrasil 体系

### Access Token

这是 Minecraft 客户端实际使用的认证凭证，用于：

- `/authserver/refresh`
- `/authserver/validate`
- `/authserver/invalidate`
- `/sessionserver/session/minecraft/join`
- `/api/user/profile/:uuid/:textureType`

### Client Token

Client Token 用来标识客户端实例。HRPAuth 使用它实现：

- 同一个客户端的幂等登录
- 不同客户端之间的互踢
- `/refresh` 抢回控制权

## `tokens.state` 三态

`tokens` 表中的状态有三种：

| 状态 | 含义 |
| --- | --- |
| `valid` | 当前可正常使用 |
| `temporarily_invalid` | 被别的客户端顶下线，只能尝试 `/refresh` 抢回 |
| `invalid` | 已永久失效，等待清理 |

## 两条最重要的状态流

### `/authserver/authenticate`

- 同 `clientToken` 且旧 token 仍有效：复用旧 `accessToken`
- 不同 `clientToken`：把其他有效 token 标为 `temporarily_invalid`，再签发新 token

### `/authserver/refresh`

- 接受 `valid` 和 `temporarily_invalid`
- 当前旧 token 变为 `invalid`
- 其他客户端的有效 token 变为 `temporarily_invalid`
- 当前客户端拿到新 `accessToken`

## 为什么现在统一走 Bearer Token

因为站内业务体系已经切到 OAuth2：

- 普通用户：走 `authorization_code + PKCE` 或第一方 `login_ticket` 快捷链路
- 微服务：走 `client_credentials`
- 代用户操作：用服务 token + 显式目标参数 + endpoint-level scope

## 验证码与 TOTP

### 图形验证码

图形验证码只服务于普通注册路径：

- `POST /captcha` 申请 token
- `GET /captcha/image/:token` 拉图片
- `POST /register` 提交 `captcha_token + captcha_code`

当前实现里，验证码开关由 `security.enable_captcha` 控制。

### 邮箱验证码

邮箱验证码通过 `POST /email-verification` 的不同 `action` 子动作完成发送与校验。

### TOTP

TOTP 的基本流程是：

1. `POST /totp/setup` 生成 `totpkey`
2. 用户把密钥导入验证器应用
3. `POST /totp/verify` 提交 `login_ticket + 6 位动态码`
4. 成功后返回 `access_token + refresh_token`

## 最容易踩的边界

### 站内 OAuth2 access token 不能调 Yggdrasil 接口

它只属于站内业务链路。

### Yggdrasil `accessToken` 不能调 `/user`、`/texture/*` 这类站内接口

它只属于 Yggdrasil 链路。

### 服务 token 不是万能自动通行证

即使是内置超级客户端签出来的服务 token，也仍然要受 scope 和目标用户参数约束。

### `temporarily_invalid` 不是“彻底失效”

它表示当前客户端被别的客户端抢占，但仍然可以通过 `/refresh` 尝试把会话抢回来。
