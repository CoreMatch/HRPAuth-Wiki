---
title: 数据模型
description: HRPAuth 当前核心表结构与关键字段语义速览。
order: 7
tags:
  - database
  - models
  - schema
updatedAt: 2026-08-15
---

# 数据模型

HRPAuth 当前围绕 5 个核心模型工作：`users`、`profiles`、`profile_properties`、`tokens`、`sessions`。

## 总览

| 模型 | 表名 | 主要职责 |
| --- | --- | --- |
| User | `users` | 用户账号、站内认证、TOTP、绑定状态 |
| Profile | `profiles` | Minecraft 角色 |
| ProfileProperty | `profile_properties` | 角色属性，尤其是纹理 |
| Token | `tokens` | Yggdrasil Access Token 状态 |
| Session | `sessions` | Minecraft 加服会话 |

## User

`users` 是整个业务体系的中心表。

重点字段：

- `uid`：主键，非自增分配
- `uuid`：内部 UUID，用于和 profile、token 关联
- `email`
- `username`
- `password`
- `remember_token`
- `verified`
- `totp`
- `cbh`
- `mbe`
- `mojang_uuid`

### 值得注意的字段语义

#### `cbh`

`cbh` 表示账号是否“由人类创建”：

- `true`：普通注册或已视为人工账号
- `false`：由 Manage Token 路径代注册出来的机器人账号

这个字段直接影响代注册用户清理任务。

#### `mbe`

`mbe` 表示是否允许 Mojang 撞名绑定。

- 关闭时，撞名 Mojang 用户会被拒绝
- 开启后，Manage Token 注册路径可以把 `mojang_uuid` 绑定到该用户

#### `mojang_uuid`

用于记录 Mojang 正版 UUID，和系统内部 `uuid` 不是一回事。

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

`sessions` 用于记录“玩家已加入某个 serverId”的临时会话。

重点字段：

- `profile_id`
- `server_id`
- `ip`
- `expires_at`

`join` 写入，`hasJoined` 读取。

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
- 登录：更新 `users.remember_token`
- TOTP：写 `users.totp`
- Manage 绑定：写 `users.mbe` 或 `users.mojang_uuid`
- Yggdrasil 登录：写 `tokens`
- 加服：写 `sessions`
- 纹理上传：写文件并更新 `profile_properties`

## 当前实现下的几个提醒

### `user_id` 在不同表里的类型表现不完全一致

从代码看，`users.uid` 是数值型，而部分关联字段更偏向使用用户 UUID 字符串。读表结构和写联调脚本时，建议直接以当前模型和实际 SQL migration 为准，不要凭字段名猜。

### 用户唯一性更多靠业务层而不是数据库层

像邮箱、用户名这类约束，很多时候是在控制器或服务层里显式判重，而不是单纯依赖数据库唯一索引。
