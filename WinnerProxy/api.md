---
title: WinnerProxy API 参考
description: WinnerProxy 暴露的 HTTP 端点及 Yggdrasil 标准实现说明
order: 7
updatedAt: 2026-08-15
---

# API Reference / API 参考

> 中英双语。中文在前，英文在后。  
> Bilingual. Chinese first, English second.

---

## 中文

WinnerProxy 暴露 5 个 HTTP 端点：1 个健康检查 + 1 个根元信息 + 3 个 Yggdrasil 公开端点。

### 约定

- **Base URL**：`http://<server.addr>`（默认 `http://localhost:2779`）
- **Yggdrasil 端点**：`/yggdrasil` 前缀
- **Content-Type**：所有请求和响应均为 `application/json`（除非特别说明）
- **错误体**：`{"error": "..."}` 配合 4xx/5xx

---

### `GET /health`

存活探针。**不访问任何上游**。

**Response 200**：
```json
{ "status": "ok" }
```

---

### `GET /` 和 `GET /yggdrasil`

Yggdrasil 服务端元信息。两个路径返回相同内容；`/` 路径是为了兼容那些探测根路径的旧客户端。

**Response 200**（透传自 HRPAuth `/`）：
```json
{
  "meta": {
    "serverName": "HRPAuth",
    "implementationName": "hrpauth",
    "implementationVersion": "1.2.3"
  },
  "skinDomains": ["example.com"],
  "signaturePublickey": "MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAE..."
}
```

具体 schema 由 HRPAuth 决定。**HRPAuth 不可达时 fallback**：
```json
{ "skinDomains": [] }
```

---

### `GET /yggdrasil/sessionserver/session/minecraft/hasJoined`

Minecraft 服务端的会话检查端点。**主要端点**，带自定义三段式逻辑。

**Query 参数**（Yggdrasil 标准）：

| 名称 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `username` | string | 是 | 进服玩家的 Minecraft 用户名 |
| `serverId` | string | 是 | `(serverId secret + 玩家 session shared key)` 的 SHA-1 hex |
| `ip` | string | 否 | 进服玩家 IP，HRPAuth 端可基于此做 IP 白名单 |

**Response 200**：`PlayerProfile` 对象，详见 [Response shape](#response-shape-响应体格式)。

**Response 204**：未找到 profile。Minecraft 服务端踢人 "Failed to verify username"。

**Response 503**：代注册阶段 HRPAuth 不可达。Minecraft 服务端可能显示通用认证错误。

**Logic**：详见 [Data Flow](./data-flow.md)。

**缓存行为**：
- Stage 1（HA）命中时，profile 写入 `ha:profile:<uuid>` 缓存（5 分钟 TTL）
- Stage 2（Mojang）命中时，profile 写入 `mojang:hasjoined:<name>` 缓存（5 分钟 TTL）；下一次同 username 进服**跳过 Mojang HTTP**

---

### `GET /yggdrasil/sessionserver/session/minecraft/profile/:uuid`

按 UUID 查询玩家 profile。Minecraft 服务端用其渲染皮肤，皮肤站也会用。

**Path 参数**：

| 名称 | 类型 | 说明 |
|---|---|---|
| `uuid` | string (UUID) | HRPAuth profile UUID（带或不带 `-` 均可） |

**Query 参数**：

| 名称 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `unsigned` | bool | `true` | `true` 时剥离 `signature` 字段。`false` 时保留签名供客户端重验。 |

**Response 200**：`PlayerProfile` 对象。

**Response 404**：UUID 不存在。

**缓存行为**：
- 命中 `ha:profile:<uuid>` 缓存 → 直接返回，**不访问 HRPAuth**
- 未命中 → 调 HRPAuth `/profile/:uuid`，结果写入缓存

---

### `POST /yggdrasil/api/profiles/minecraft`

按用户名批量查询。Minecraft 启动器和皮肤站会用到。**只查 HRPAuth**（不查 Mojang，不代注册）。

**Request body**（用户名数组）：
```json
["alice", "bob", "charlie"]
```

**Response 200**（数组，顺序不限）：
```json
[
  { "id": "a1b2c3d4e5f6...", "name": "alice" },
  { "id": "f6e5d4c3b2a1...", "name": "bob" }
]
```

HRPAuth 中**找不到的用户名会被静默忽略**（不报错）。

**无缓存**：批量查询结果不缓存（条目过多，且批量结果一般是一次性消费）。

---

### Response shape / 响应体格式

`PlayerProfile` 是 Yggdrasil 标准 profile：

```json
{
  "id": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "name": "Alice",
  "properties": [
    {
      "name": "textures",
      "value": "eyJ0aW1lc3RhbXAi...",
      "signature": "MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAE..."
    }
  ]
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string (UUID) | HRPAuth `profiles.id`。**永远是 HRPAuth 的，不是 Mojang 的** |
| `name` | string | HRPAuth `users.username` |
| `properties` | array | 皮肤 / textures。可能为空 |

`hasJoined` 走 Mojang 鉴权路径时，`properties` 是 **Mojang 签名过的 textures** —— Minecraft 客户端用内置 Mojang 公钥验签。`id` 和 `name` 仍是 HRPAuth 的。

---

### 错误响应 / Error responses

```json
{ "error": "<human-readable message>" }
```

| 状态 | 触发场景 | Body |
|---|---|---|
| 400 | 请求体错误 / 无效 query | `{"error": "..."}` |
| 404 | 资源不存在（profile 查询 miss）| `{"error": "..."}` |
| 500 | 内部错误 | `{"error": "..."}` |
| 503 | 代注册阶段 HRPAuth 不可达 | `{"error": "auth backend unavailable"}` |

Minecraft vanilla 客户端**不展示这些 error body** —— 服务端日志是诊断的唯一入口。

---

### 已移除端点（v0.1 → v0.2）

- `GET /cache/:key`
- `POST /cache`
- `DELETE /cache/:key`
- `GET /cache/stats`

这些是 v0.1 时代对外暴露的通用 FreeCache 端点。**v0.2+ 缓存仅内部使用**。

---

## English

WinnerProxy exposes 5 HTTP endpoints: 1 health check + 1 root meta + 3 Yggdrasil public endpoints.

### Conventions

- **Base URL**: `http://<server.addr>` (default `http://localhost:2779`)
- **Yggdrasil endpoints**: `/yggdrasil` prefix
- **Content-Type**: all requests and responses are `application/json` (unless noted)
- **Error body**: `{"error": "..."}` for 4xx/5xx

---

### `GET /health`

Liveness probe. **Does not touch any upstream.**

**Response 200**:
```json
{ "status": "ok" }
```

---

### `GET /` and `GET /yggdrasil`

Yggdrasil server metadata. Both paths return the same content; `/` is for legacy clients that probe the root.

**Response 200** (proxied from HRPAuth `/`):
```json
{
  "meta": {
    "serverName": "HRPAuth",
    "implementationName": "hrpauth",
    "implementationVersion": "1.2.3"
  },
  "skinDomains": ["example.com"],
  "signaturePublickey": "MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAE..."
}
```

Exact schema is whatever HRPAuth returns. **HRPAuth unreachable → fallback**:
```json
{ "skinDomains": [] }
```

---

### `GET /yggdrasil/sessionserver/session/minecraft/hasJoined`

Minecraft server's session check. **The main endpoint** with three-stage custom logic.

**Query parameters** (Yggdrasil standard):

| Name | Type | Required | Description |
|---|---|---|---|
| `username` | string | yes | Joining player's Minecraft username |
| `serverId` | string | yes | Hex SHA-1 of (serverId secret + player's session shared key) |
| `ip` | string | no | Joining player's IP, used by HRPAuth-side IP allowlisting if enabled |

**Response 200**: a `PlayerProfile` object — see [Response shape](#response-shape).

**Response 204**: no profile found. Minecraft server kicks "Failed to verify username".

**Response 503**: HRPAuth unreachable during proxy-registration. Minecraft server may show a generic auth error.

**Logic**: see [Data Flow](./data-flow.md).

**Cache behavior**:
- Stage 1 (HA) hit → profile written to `ha:profile:<uuid>` cache (5 min TTL)
- Stage 2 (Mojang) hit → profile written to `mojang:hasjoined:<name>` cache (5 min TTL); the next attempt for the same username **skips Mojang HTTP**

---

### `GET /yggdrasil/sessionserver/session/minecraft/profile/:uuid`

Look up a player's profile by UUID. Used by Minecraft server for skin rendering and by skin websites.

**Path parameters**:

| Name | Type | Description |
|---|---|---|
| `uuid` | string (UUID) | HRPAuth profile UUID (with or without hyphens) |

**Query parameters**:

| Name | Type | Default | Description |
|---|---|---|---|
| `unsigned` | bool | `true` | If `true`, strips signatures. Set `false` to keep signatures for client-side re-verification. |

**Response 200**: a `PlayerProfile` object.

**Response 404**: no profile with that UUID.

**Cache behavior**:
- Hit on `ha:profile:<uuid>` → return immediately, **no HRPAuth call**
- Miss → call HRPAuth `/profile/:uuid` and warm the cache

---

### `POST /yggdrasil/api/profiles/minecraft`

Batch lookup by username. Used by Minecraft launchers and skin sites. **HRPAuth only** (no Mojang, no auto-registration).

**Request body** (array of usernames):
```json
["alice", "bob", "charlie"]
```

**Response 200** (array, order arbitrary):
```json
[
  { "id": "a1b2c3d4e5f6...", "name": "alice" },
  { "id": "f6e5d4c3b2a1...", "name": "bob" }
]
```

Usernames not found in HRPAuth are **silently omitted** (no error).

**No cache**: batch results are not cached (too many entries; typically one-shot consumption).

---

### Response shape

`PlayerProfile` is the Yggdrasil-standard profile object:

```json
{
  "id": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "name": "Alice",
  "properties": [
    {
      "name": "textures",
      "value": "eyJ0aW1lc3RhbXAi...",
      "signature": "MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAE..."
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `id` | string (UUID) | HRPAuth `profiles.id`. **Always HRPAuth's, never Mojang's** |
| `name` | string | HRPAuth `users.username` |
| `properties` | array | Skin / textures. May be empty |

For `hasJoined` on the Mojang auth path, `properties` contains **Mojang-signed** textures — the Minecraft client verifies them with its built-in Mojang public key. `id` and `name` are still HRPAuth's.

---

### Error responses

```json
{ "error": "<human-readable message>" }
```

| Status | When | Body |
|---|---|---|
| 400 | Bad body / invalid query | `{"error": "..."}` |
| 404 | Resource not found (profile miss) | `{"error": "..."}` |
| 500 | Internal error | `{"error": "..."}` |
| 503 | HRPAuth unreachable during proxy-registration | `{"error": "auth backend unavailable"}` |

Vanilla Minecraft clients **do not display these bodies** — the server log is the place to look.

---

### Removed endpoints (v0.1 → v0.2)

- `GET /cache/:key`
- `POST /cache`
- `DELETE /cache/:key`
- `GET /cache/stats`

These were generic FreeCache exposures from v0.1. **v0.2+ the cache is internal-only.**
