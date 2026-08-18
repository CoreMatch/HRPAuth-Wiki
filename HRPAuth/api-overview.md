---
title: 接口总览
description: 按站内业务接口和 Yggdrasil 接口对 HRPAuth 的 HTTP 能力做一页式总览。
order: 6
tags:
  - api
  - http
  - yggdrasil
updatedAt: 2026-08-15
---

# 接口总览

HRPAuth 的接口可以分成两大类：站内业务接口和 Yggdrasil 接口。

## 站内业务接口

### 服务状态

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/status` | 查看服务在线状态、版本和时间 |

### 认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/login` | 普通用户登录，签发 Remember Token |
| `POST` | `/loginbymt` | 运维使用 Manage Token 为指定用户签发 Remember Token |
| `POST` | `/register` | 用户注册；同时支持普通路径和 Manage Token 路径 |
| `GET` | `/logout` | 注销当前 Remember Token |

### 用户与资料

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/user` | 获取用户基础信息 |
| `POST` | `/user/declare-email` | 为指定用户声明邮箱 |
| `POST` | `/user/mojang-bind-enable` | 开启 Mojang 绑定许可 |
| `POST` | `/change-username` | 修改站内用户名 |
| `POST` | `/change-profile-name` | 修改 Minecraft 角色名 |

### 验证与安全

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/email-verification` | 发送测试邮件、发送验证码、校验验证码 |
| `GET` | `/totpgen` | 根据 secret 生成 TOTP，主要用于调试 |
| `POST` | `/totp/setup` | 配置 TOTP |
| `POST` | `/totp/verify` | 校验 TOTP 动态码 |
| `POST` | `/totp/hasbeenenabled` | 查询是否已开启 TOTP |
| `POST` | `/captcha` | 生成图形验证码 |
| `GET` | `/captcha/enabled` | 查询是否启用图形验证码 |
| `GET` | `/captcha/image/:token` | 拉取验证码图片 |

### 密钥与纹理

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/generate-key` | 生成 RSA 密钥对 |
| `POST` | `/texture/upload` | 上传皮肤或披风 |
| `POST` | `/texture/delete` | 删除纹理 |
| `POST` | `/texture/get` | 获取纹理信息 |

## Yggdrasil 接口

### 元信息

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/` | 获取 Yggdrasil 元信息、公钥、功能开关和 skin domains |

### authserver

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/authserver/authenticate` | 用户认证，签发或复用 `accessToken` |
| `POST` | `/authserver/refresh` | 刷新并重建会话 |
| `POST` | `/authserver/validate` | 校验 Token 是否仍有效 |
| `POST` | `/authserver/invalidate` | 使当前 Token 失效 |
| `POST` | `/authserver/signout` | 注销账号下的全部 Yggdrasil Token |

### sessionserver

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/sessionserver/session/minecraft/join` | 写入加入服务器会话 |
| `GET` | `/sessionserver/session/minecraft/hasJoined` | 校验玩家是否已加入服务器 |
| `GET` | `/sessionserver/session/minecraft/hasjoined` | 小写兼容路径 |
| `GET` | `/sessionserver/session/minecraft/profile/:uuid` | 查询角色资料 |

### profile 与纹理

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/profiles/minecraft` | 批量查询角色资料 |
| `PUT` | `/api/user/profile/:uuid/:textureType` | 通过 Bearer Access Token 上传纹理 |
| `DELETE` | `/api/user/profile/:uuid/:textureType` | 通过 Bearer Access Token 删除纹理 |
| `GET` | `/textures/:hash` | 下载纹理文件 |

## 三个需要特别理解的接口族

### `/register`

这是业务语义最重的接口之一：

- 普通路径：面向 WebUI 注册
- 管理路径：面向 Manage Token 代注册与 Mojang 绑定

如果你在调 WinnerProxy 或撞名绑定逻辑，这个接口是第一现场。

### `/user/*` 与 `/change-*`

这些接口大量使用 `remember_token`，并支持通过 `auth_type: "manage"` 进入运维代操作模式。

### `/authserver/*`

这里包含了 Yggdrasil 兼容层里最关键的会话状态机，尤其是 `authenticate`、`refresh`、`validate` 的配合行为。

## 调试建议

### 调业务接口

优先关注：

- `remember_token` 是否正确
- 是否忘记传 `auth_type: "manage"`
- Manage 模式下是否补了 `uid` 或 `email`

### 调 Yggdrasil 接口

优先关注：

- `accessToken` 和 `clientToken` 是否匹配
- 当前 token 是否已被其他客户端挤成 `temporarily_invalid`
- 用户是否已有可用 profile

## 返回风格

站内业务接口大多返回统一的 `success/message/data/meta` 风格。

Yggdrasil 接口则遵循更接近原协议的响应风格，例如：

- 直接返回 `accessToken`
- 使用 `ForbiddenOperationException`
- 校验成功时返回 `204 No Content`
