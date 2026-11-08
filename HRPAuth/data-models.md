---
title: 数据模型
description: HRPAuth 当前核心表结构与关键字段语义速览。
order: 7
tags:
  - database
  - models
  - schema
updatedAt: 2026-09-07
---

# 数据模型

HRPAuth 当前围绕两组核心模型工作：站内 OAuth2 相关表，以及 Yggdrasil 相关表。

## 总览

| 模型 | 表名 | 主要职责 |
| --- | --- | --- |
| User | `users` | 用户账号、站内认证、TOTP、绑定状态 |
| Profile | `profiles` | Minecraft 角色 |
| ProfileProperty | `profile_properties` | 角色属性，尤其是纹理 |
| OAuth2Client | `oauth2_clients` | 站内 OAuth2 客户端 |
| OAuth2AccessToken | `oauth2_access_tokens` | 站内 Bearer token |
| OAuth2RefreshToken | `oauth2_refresh_tokens` | 站内刷新 token |
| OAuth2AuthorizationCode | `oauth2_authorization_codes` | 站内授权码 |
| Token | `tokens` | Yggdrasil Access Token 状态 |
| Session | `sessions` | Minecraft 加服会话 |
| ProfileKey | `profile_keys` | Minecraft 1.19+ 聊天签名密钥对 |

## User

`users` 是整个业务体系的中心表。

重点字段：

- `uid`：主键，非自增分配
- `uuid`：内部 UUID，用于和 profile、token 关联
- `email`
- `username`
- `password`
- `remember_token`（遗留字段）
- `verified`
- `totp`
- `2FA`
- `cbh`
- `mbe`
- `mojang_uuid`

### 值得注意的字段语义

#### `cbh`

`cbh` 表示账号是否"由人类创建"：

- `true`：普通注册或已视为人工账号
- `false`：由服务 token 代注册出来的机器人账号

这个字段直接影响代注册用户清理任务。

**运维代认领翻转**：通过 `POST /admin/claim-user`（Service Token + `user.claim.as-service` scope）给一个代注册用户指派真实邮箱和密码后，`cbh` 会被翻转成 `1`，避免被 30 天清理任务误删。该端点按 `username` 定位目标用户，仅对 `cbh=0` 的账号生效。详见 [接口总览](./api-overview.md)。

**强制绑定转移**：通过 `POST /admin/force-bind`（Service Token + Manage Token）可以将代注册账号的 `mojang_uuid` 转移到玩家的手动注册账号，并删除代注册账号。适用于同时拥有代注册账号和手动注册账号的玩家。

#### `mbe`

`mbe` 表示是否允许 Mojang 撞名绑定。

- 关闭时（`0`，默认），撞名 Mojang 用户会被拒绝（409 HA 优先）
- 开启后（`1`），服务代注册路径可以把 `mojang_uuid` 绑定到该用户

**读写端点**：

| 端点 | 操作 |
| --- | --- |
| `POST /user` | 响应 `data.mbe`（0 或 1） |
| `POST /user/mojang-bind-enable` | 设置 `mbe = 1`（幂等） |
| `POST /user/mojang-bind-disable` | 设置 `mbe = 0`（幂等） |
| 服务代注册 `/register` 2.a 绑定成功 | 自动重置 `mbe = 0`（与 `mojang_uuid` 写入同事务） |

**15 分钟自动禁用**：启用 MBE 后开始 15 分钟倒计时。若在窗口内未完成绑定（`mojang_uuid` 写入），系统自动将 `mbe` 恢复为 `0`。绑定成功时同样会将 `mbe` 重置为 `0`。手动禁用或重新启用（重启计时器）也可取消倒计时。

#### `mojang_uuid`

用于记录 Mojang 正版 UUID，和系统内部 `uuid` 不是一回事。

#### `2FA`

`2FA` 表示是否开启双因素认证（当前仅支持 TOTP）：

- `1` (true)：登录时强制进行 TOTP 验证（前提是已配置 `totp` 密钥）
- `0` (false)：不要求双因素认证

## Profile

每个 Profile 代表一个 Minecraft 角色。

重点字段：

- `id`
- `user_id`
- `name`
- `model`

当前实现会在用户创建时生成默认角色。纹理上传、Yggdrasil 资料查询等能力都会围绕 Profile 展开。

## ProfileProperty

这一层主要用于承载角色附加属性，最重要的是纹理：

- `profile_id`
- `name`
- `value`
- `signature`

当皮肤或披风发生变化时，实际会更新这一层以及对应的文件存储。

## OAuth2 相关表

站内业务接口现在统一使用 Bearer Token 进行鉴权。

### OAuth2AccessToken (`oauth2_access_tokens`)

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `access_token` | string | 核心令牌字符串 |
| `user_id` | string | 关联用户的内部 UUID |
| `subject_type` | enum | `user` 或 `service` |
| `expires_at` | datetime | 过期时间 |
| `revoked_at` | datetime | 撤销时间（非空表示已失效） |

### OAuth2RefreshToken (`oauth2_refresh_tokens`)

用于在 `access_token` 过期后换取新令牌。

## Token

`tokens` 是 Yggdrasil 体系的状态表。

重点字段：

- `access_token`
- `client_token`
- `user_id`
- `selected_profile_id`
- `issued_at`
- `expires_in_days`
- `state`

### 为什么它重要

这个表决定了：

- 同客户端登录是否复用旧 token
- 不同客户端之间如何互踢
- `/refresh` 是否还能抢回会话
- 清理任务要删除哪些无效 token

## Session

`sessions` 用于记录"玩家已加入某个 serverId"的临时会话。

重点字段：

- `profile_id`
- `server_id`
- `ip`
- `expires_at`

`join` 写入，`hasJoined` 读取。

## ProfileKey

`profile_keys` 是一对一的存储 Minecraft 1.19+ Profile Key（聊天签名密钥对）。仅当 `yggdrasil.feature_flags.enable_profile_key = true` 时才会被填充。

重点字段：

- `user_id`（一个用户一行）
- `public_key`、`private_key`（PEM 格式，RSA 2048）
- `public_key_signature`（Yggdrasil 私钥对公钥的 SHA1withRSA 签名）
- `expires_at`、`refreshed_after`（默认 48h 有效，颁发 40h 后允许轮换）

完整生命周期参考 [Profile Keys](./profile-keys.md)。

## 关系理解

可以把主要关系理解成：

```text
User
  -> Profile
    -> ProfileProperty
  -> Token
  -> Session（通过 Profile 间接关联）
```

## 和业务逻辑的对应关系

- 注册：写 `users`，并创建默认 `profiles`
- OAuth2 登录：写 `oauth2_*`
- TOTP：写 `users.totp`
- 服务代绑定：写 `users.mbe` 或 `users.mojang_uuid`
- Yggdrasil 登录：写 `tokens`
- 加服：写 `sessions`
- 纹理上传：写文件并更新 `profile_properties`

## 当前实现下的几个提醒

### `user_id` 在不同表里的类型表现不完全一致

这是一个已知的文档偏移点，请特别注意：

- **`users.uid`**：数据库主键，数值型（`uint`）。用于 `target_uid` 等业务逻辑。
- **关联表中的 `user_id`**：在 `profiles`、`tokens`、`oauth2_access_tokens` 等表中，`user_id` 字段实际上存储的是用户的 **内部 UUID**（`varchar(32)`），对应 `users.uuid`。
- **开发建议**：在编写 SQL 或 GORM 查询时，始终确认你是在通过 `uid` 还是 `uuid` 进行关联。

### 用户唯一性更多靠业务层而不是数据库层

像邮箱、用户名这类约束，很多时候是在控制器或服务层里显式判重，而不是单纯依赖数据库唯一索引。
