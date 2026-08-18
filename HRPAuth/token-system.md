---
title: Token 与鉴权体系
description: 理解 Remember Token、Manage Token、Yggdrasil Token、验证码与 TOTP 的关系与边界。
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
| Remember Token | `remember_token` / `remtoken` / `rt` | 站内业务接口 | `users.remember_token` |
| Manage Token | `manage.token` | 运维管理路径 | `config.yaml` |
| Yggdrasil Access Token | `accessToken` | Yggdrasil 接口 | `tokens.access_token` |
| Yggdrasil Client Token | `clientToken` | Yggdrasil 客户端标识 | `tokens.client_token` |
| 邮箱验证码 | `code` | 邮箱验证 | Redis |
| 图形验证码 | `captcha_token` + `captcha_code` | 普通注册路径 | Redis |
| TOTP Secret | `totpkey` | 两步验证配置 | `users.totp` |

## 站内业务体系

### Remember Token

普通用户登录成功后，服务会生成随机 Token 并写入 `users.remember_token`。

它主要用于：

- `/user`
- `/logout`
- `/change-username`
- `/change-profile-name`
- `/totp/setup`
- `/totp/hasbeenenabled`
- `/texture/*`

### Manage Token

Manage Token 的定位是“超级 Remember Token”，但它不是用户会话。

必须同时满足下面两个条件，才会走管理路径：

1. token 值等于 `config.manage.token`
2. 请求显式声明 `auth_type: "manage"`

如果只传了 Manage Token 但没有声明 `auth_type: "manage"`，当前实现不会自动升级为运维模式。

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

## 为什么很多接口都有 `auth_type`

因为 HRPAuth 需要兼容“普通用户调用”和“运维代操作”两种模式。

### 默认行为

未声明 `auth_type` 时，默认按普通 Remember Token 处理。

### 管理行为

声明 `auth_type: "manage"` 后：

- token 必须匹配配置中的 Manage Token
- 很多接口还必须额外提供 `uid` 或 `email`

否则服务端无法知道你想替哪个用户执行操作。

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
3. `POST /totp/verify` 提交 6 位动态码
4. 成功后返回 `rt`

## 最容易踩的边界

### `remember_token` 不能调 Yggdrasil 接口

它只属于站内业务链路。

### `accessToken` 不能调 `/user`、`/texture/*` 这类站内接口

它只属于 Yggdrasil 链路。

### Manage Token 不是万能自动通行证

很多接口即使识别了 Manage Token，也仍然需要你明确指定目标用户。

### `temporarily_invalid` 不是“彻底失效”

它表示当前客户端被别的客户端抢占，但仍然可以通过 `/refresh` 尝试把会话抢回来。
