---
title: WinnerProxy 架构设计
description: WinnerProxy 的核心架构、职责划分与身份模型
order: 2
updatedAt: 2026-08-15
---

# Architecture / 架构

> 中英双语。中文在前，英文在后。  
> Bilingual. Chinese first, English second.

---

## 中文

### 总览

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Minecraft Server (Paper / BungeeCord / Velocity)                          │
│  online-mode=true, yggdrasil-api-url=http://winnerproxy:2779/yggdrasil     │
└────────────────────────────────┬───────────────────────────────────────────┘
                                 │ Yggdrasil protocol
                                 ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  WinnerProxy                                                                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                        │
│  │ /health      │ │ /, /yggdrasil│ │ Yggdrasil    │                        │
│  │              │ │ (root meta)  │ │ 端点 (3 个)  │                        │
│  └──────────────┘ └──────────────┘ └──────┬───────┘                        │
│  ┌─────────────────────────────┐           │                                │
│  │ internal/cache (freecache)  │◄──────────┤                                │
│  │ 5 min TTL, 100 MiB 默认     │           │                                │
│  │ HA profile / Mojang profile │           │                                │
│  └─────────────────────────────┘           │                                │
│  ┌────────────────────────┐  ┌─────────────▼─────────────┐                │
│  │ MojangService          │  │ HRPAuth Client            │                │
│  │ (sessionserver +       │  │ (Yggdrasil 公开 +         │                │
│  │  api.minecraftservices)│  │  /register 服务模式)      │                │
│  └────────────┬───────────┘  └─────────────┬─────────────┘                │
└───────────────┼──────────────────────────────┼──────────────────────────────┘
                │                              │
                ▼                              ▼
   ┌────────────────────────┐    ┌────────────────────────────┐
   │ Mojang sessionserver   │    │ HRPAuth                    │
   │ api.minecraftservices  │    │(Yggdrasil + 服务模式代注册)│
   └────────────────────────┘    └────────────────────────────┘
```

### 职责划分

**WinnerProxy 持有**：
- 一个 freecache 进程内缓存（5 分钟 TTL，挡重复请求）
- HTTP 监听（`server.addr`）
- 三个小客户端：`MojangService`、`HRPAuth` 客户端（Yggdrasil 公开 + `/register` 服务模式路径）

**WinnerProxy 不持有**（全部归 HRPAuth 内部）：
- 玩家身份数据库（`users` 表是 HRPAuth 的数据源）
- Mojang ↔ HRPAuth 账号绑定逻辑
- `cbh=0` 账号的清理任务
- 任何直接对 HRPAuth 数据库的写操作
- "Link Mojang" 入口（HRPAuth WebUI 自己提供）

### 身份模型

```
   HRPAuth `users` 行                 HRPAuth `profiles` 行
   ┌─────────────┐                    ┌──────────────────┐
   │ uid         │◄────┐              │ id (UUID)        │
   │ username    │     │              │ user_id (FK)     │
   │ email       │     └──────────────│ username         │
   │ password    │                    │ (skin, etc.)     │
   │ mojang_uuid │  nullable          └──────────────────┘
   │ mbe         │  0 or 1
   │ cbh         │  0 or 1
   └─────────────┘
```

> 注：`users` 表主键 `uid`（非自增），`profiles` 表主键 `id`（UUID）。详见 [HA-ROADMAP §2.3](../HA-ROADMAP.md#23-索引)。

Minecraft 服务端**永远看到的是 HRPAuth `profiles.id`**（一个 UUID），看不到 Mojang UUID。

`users.mojang_uuid` 仅供 HRPAuth 内部用来：
- 识别"Mojang 玩家 X" = "HRPAuth 玩家 Y"
- 拒绝撞名（一个 Mojang 玩家使用一个 HRPAuth 已绑定的不同 Mojang UUID 的用户名）

### 鉴权路径

| 路径 | 过程 | 服务端看到的 |
|---|---|---|
| **HRPAuth 密码登录** | 玩家走 HRPAuth WebUI 或 `/authserver/authenticate` 拿 session token。服务端调 `hasJoined` 时 HRPAuth 验证 token。 | HRPAuth profile（HRPAuth UUID + HRPAuth 皮肤）|
| **Mojang/Microsoft 登录** | 玩家用官方启动器。服务端调 `hasJoined` 走 Mojang 路径，最终在 HRPAuth 内代注册。 | HRPAuth `profile_id` + Mojang 皮肤 |

两种情况下，同一个玩家**永远显示同一个 UUID**。

### 皮肤

皮肤按鉴权路径透传：
- **HRPAuth 路径** → 返回 HRPAuth 存储的皮肤
- **Mojang 路径** → 返回 Mojang 签名过的皮肤（由 Minecraft 客户端用内置 Mojang 公钥验签）

玩家可能因为登录方式不同而显示不同皮肤，**这是有意的**，符合"用 Mojang 鉴权就用 Mojang 皮肤"的规则。

### 缓存层

`internal/cache` 包用 [freecache](https://github.com/coocood/freecache) 实现两个 keyspace：

| Key | Value | TTL | 写入时机 |
|---|---|---|---|
| `ha:profile:<uuid>` | HRPAuth profile（JSON）| 5 min | `QueryProfile` miss 后回填；`HasJoined` stage 1 命中时也写入 |
| `mojang:hasjoined:<name>` | Mojang profile（JSON）| 5 min | `HasJoined` stage 2 命中时写入，下一次同 username 直接跳过 Mojang HTTP |

**负响应（HA 204 / Mojang 204 / 上游错误）不缓存**，确保新创建的账号能立即生效。

`cache.size = 0` → 退化为 `Noop` 缓存（所有 Get 都返回 miss，所有 Set 都是 no-op）。

### 失败模式

| 条件 | WinnerProxy 响应 |
|---|---|
| 所有上游都 204 | `204 No Content`（Minecraft 踢人 "Failed to verify username"）|
| Stage 1 HA 5xx | WARN 日志 + 走 stage 2 |
| Stage 2 Mojang 5xx | `204 No Content` |
| Stage 3 register 409 username_already_bound | WARN 日志 + `204 No Content` |
| Stage 3 register 5xx | `503 Service Unavailable` |
| Stage 3 register 4xx (其他) | `500 Internal Server Error` + ERROR 日志 |

### 故意不做的事

- ❌ 本地玩家映射表（HRPAuth 持有）
- ❌ Mojang UUID → HRPAuth UUID 翻译逻辑（HRPAuth 做）
- ❌ `/cache/*` HTTP 端点（缓存仅内部使用）
- ❌ "prohibit mode" / "always permit" 标志（HRPAuth 自己有用户系统）

更多细节见 [Data Flow](./data-flow.md)。

---

## English

### Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Minecraft Server (Paper / BungeeCord / Velocity)                          │
│  online-mode=true, yggdrasil-api-url=http://winnerproxy:2779/yggdrasil     │
└────────────────────────────────┬───────────────────────────────────────────┘
                                 │ Yggdrasil protocol
                                 ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  WinnerProxy                                                                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                        │
│  │ /health      │ │ /, /yggdrasil│ │ Yggdrasil    │                        │
│  │              │ │ (root meta)  │ │ endpoints    │                        │
│  └──────────────┘ └──────────────┘ └──────┬───────┘                        │
│  ┌─────────────────────────────┐           │                                │
│  │ internal/cache (freecache)  │◄──────────┤                                │
│  │ 5 min TTL, 100 MiB default  │           │                                │
│  │ HA profile / Mojang profile │           │                                │
│  └─────────────────────────────┘           │                                │
│  ┌────────────────────────┐  ┌─────────────▼─────────────┐                │
│  │ MojangService          │  │ HRPAuth Client            │                │
│  │ (sessionserver +       │  │ (Yggdrasil public +       │                │
│  │  api.minecraftservices)│  │  /register service mode)  │                │
│  └────────────┬───────────┘  └─────────────┬─────────────┘                │
└───────────────┼──────────────────────────────┼──────────────────────────────┘
                │                              │
                ▼                              ▼
   ┌────────────────────────┐    ┌────────────────────────────┐
   │ Mojang sessionserver   │    │ HRPAuth                    │
   │ api.minecraftservices  │    │ (Yggdrasil + Service reg.) │
   └────────────────────────┘    └────────────────────────────┘
```

### What WinnerProxy owns

- An in-process freecache (5 min TTL, shields repeated lookups)
- The HTTP listener on `server.addr`
- Three small clients: `MojangService`, the `HRPAuth` client (Yggdrasil public + `/register` service-mode path)

### What WinnerProxy does NOT own (HRPAuth's internal concerns)

- The user table (`users` is HRPAuth's source of truth)
- Mojang ↔ HRPAuth account binding
- Cleanup of `cbh=0` accounts
- Any direct database write
- The "Link Mojang" UI (HRPAuth WebUI provides it)

### Identity model

```
   HRPAuth `users` row                 HRPAuth `profiles` row
   ┌─────────────┐                    ┌──────────────────┐
   │ uid         │◄────┐              │ id (UUID)        │
   │ username    │     │              │ user_id (FK)     │
   │ email       │     └──────────────│ username         │
   │ password    │                    │ (skin, etc.)     │
   │ mojang_uuid │  nullable          └──────────────────┘
   │ mbe         │  0 or 1
   │ cbh         │  0 or 1
   └─────────────┘
```

> Note: `users` PK is `uid` (not auto-increment); `profiles` PK is `id` (UUID). See [HA-ROADMAP §2.3](../HA-ROADMAP.md#23-索引).

The Minecraft server **always sees the HRPAuth `profiles.id`** (a UUID), never the Mojang UUID.

`users.mojang_uuid` is purely a link HRPAuth uses internally to:
- Recognize "this Mojang player who just joined = this HRPAuth user"
- Reject collisions (a Mojang player trying to use a username bound to a *different* Mojang UUID by an HRPAuth user)

### Auth paths

| Path | Process | What the server sees |
|---|---|---|
| **HRPAuth password login** | Player uses HRPAuth WebUI or `/authserver/authenticate` to get a session token; server's `hasJoined` call to HRPAuth validates the token. | HRPAuth profile (HRPAuth UUID + HRPAuth skin) |
| **Mojang/Microsoft login** | Player uses the official launcher; `hasJoined` falls through to Mojang, then proxy-registers in HRPAuth. | HRPAuth `profile_id` + Mojang skin |

In both cases the same player **always shows the same UUID**.

### Skins

- **HRPAuth path** → return HRPAuth's stored skin.
- **Mojang path** → return Mojang-signed textures (verified by the Minecraft client using its built-in Mojang public key).

A player may appear with different skins depending on how they last logged in. **This is intentional** and matches the "use Mojang's skin when Mojang auth" rule.

### Cache layer

`internal/cache` is a [freecache](https://github.com/coocood/freecache)-backed in-process store with two keyspaces:

| Key | Value | TTL | Written when |
|---|---|---|---|
| `ha:profile:<uuid>` | HRPAuth profile (JSON) | 5 min | `QueryProfile` miss-then-fetch; `HasJoined` stage 1 hit |
| `mojang:hasjoined:<name>` | Mojang profile (JSON) | 5 min | `HasJoined` stage 2 hit (so the next attempt for the same username skips Mojang) |

**Negative responses (HA 204 / Mojang 204 / upstream errors) are not cached** so newly-created accounts become effective immediately.

`cache.size = 0` → degrades to a `Noop` cache (all `Get` miss, all `Set` no-op).

### Failure modes

| Condition | WinnerProxy response |
|---|---|
| All upstreams return 204 | `204 No Content` (Minecraft kicks: "Failed to verify username") |
| Stage 1 HA 5xx | WARN log, fall through to stage 2 |
| Stage 2 Mojang 5xx | `204 No Content` |
| Stage 3 register 409 `username_already_bound` | WARN log + `204 No Content` |
| Stage 3 register 5xx | `503 Service Unavailable` |
| Stage 3 register 4xx (other) | `500 Internal Server Error` + ERROR log |

### Deliberately absent

- ❌ Local player mapping table (HRPAuth owns it)
- ❌ Mojang UUID → HRPAuth UUID translation logic (HRPAuth does it)
- ❌ `/cache/*` HTTP endpoints (cache is internal-only)
- ❌ "prohibit mode" / "always permit" flag (HRPAuth's user system covers it)

See [Data Flow](./data-flow.md) for the full request walk-through.
