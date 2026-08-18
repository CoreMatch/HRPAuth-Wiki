# Data Flow

This page details exactly what happens when a Minecraft server calls WinnerProxy's `hasJoined` endpoint, including every branch and edge case.

## Overview

```
Minecraft server (online-mode=true, yggdrasil-api-url=...winnerproxy:2779/yggdrasil)
  │
  │ GET /yggdrasil/sessionserver/session/minecraft/hasJoined?username=X&serverId=Y
  ▼
WinnerProxy
  │
  ├─► Stage 1: HRPAuth auth path
  │     GET {hrpauth.url}/sessionserver/session/minecraft/hasJoined?...
  │     ├─ 200 + profile → return it verbatim to Minecraft. DONE.
  │     ├─ 204 → fall through to Stage 2.
  │     └─ 5xx / network error → log WARN, fall through to Stage 2.
  │
  ├─► Stage 2: Mojang auth path
  │     GET https://sessionserver.mojang.com/session/minecraft/hasJoined?...
  │     ├─ 200 + mojangProfile → extract mojangUUID, proceed to Stage 3.
  │     ├─ 204 → return 204 to Minecraft. DONE.
  │     └─ 5xx / network error → log WARN, return 204. DONE.
  │
  └─► Stage 3: Proxy registration
        POST {hrpauth.url}/register
        Body: { username, password (random 16 chars), email (auto placeholder),
                mojang_uuid, remember_token: <M.T.> }
        │
        ├─ 200 + {profile_id, uid, cbh: 0} →     // cbh 字段**仅**在 M.T. 路径新建代注册 (cbh=0) 时返回；cbh=1 / 幂等 / bind 路径均不返回该字段
        │     Return to Minecraft:
        │       id: profile_id
        │       name: <POST /register 请求体中的 username, 即 mojangProfile.name>     // HA 响应不带 username 字段, WinnerProxy 用请求时已知的名字
        │       properties: mojangProfile.properties
        │     DONE.
        │
        ├─ 409 (username_already_bound) → 
        │     log WARN "Mojang player collided with already-bound HA user",
        │     return 204. DONE.
        │
        ├─ 400 (invalid_mojang_uuid) → 
        │     log ERROR (programming error: mojang UUID is well-formed),
        │     return 500. DONE.
        │
        └─ 5xx / network error → 
              log ERROR, return 503. DONE.
```

## Stage 1: HRPAuth auth path

HRPAuth's public `hasJoined` validates a session that the player established with HRPAuth via `/authserver/authenticate`. If the player used an HRPAuth password to log in, this stage returns 200 with HRPAuth's profile for that player.

**What the response looks like to the Minecraft server**:
- `id`: HRPAuth `profiles.id` (the player's HRPAuth UUID)
- `name`: HRPAuth `users.username`
- `properties`: HRPAuth-stored skin properties (whatever the player set in HRPAuth WebUI)

This is the "HRPAuth skin" path. The Minecraft client uses the embedded Mojang public key in HRPAuth's signature to verify the textures — wait, actually, HRPAuth signs with its own key. The Minecraft client uses the public key in the server's `/` response (`signaturePublickey`) to verify. So:
- The skin's `signature` is HRPAuth's signature
- The Minecraft client verifies against `signaturePublickey` from `GET /yggdrasil`
- Since WinnerProxy transparently proxies `GET /yggdrasil` from HRPAuth, this works.

## Stage 2: Mojang auth path

If Stage 1 returns 204, the player did not use an HRPAuth session. They may be using a Mojang/Microsoft session instead. We ask Mojang's `hasJoined` to find out.

If 200, we now have:
- `mojangProfile.id`: the player's Mojang UUID (e.g. `f7c77d99-9f15-4a66-a87d-c4a51ef30d19`)
- `mojangProfile.name`: the player's Mojang username
- `mojangProfile.properties`: the player's Mojang-signed skin properties

These are the **Mojang-native** identity, signed by Mojang. We need to hand them to HRPAuth for "translation" to the HRPAuth identity.

## Stage 3: Proxy registration

We call HRPAuth's `POST /register` with:

```json
{
  "username": "Alice",
  "password": "<random 16-char string>",
  "email": "alice@mojang-imported.invalid",
  "mojang_uuid": "f7c77d999f154a66a87dc4a51ef30d19",
  "remember_token": "<M.T.>"
}
```

`username` is the Minecraft name from `mojangProfile.name`. `mojang_uuid` is the UUID with hyphens stripped (HRPAuth stores 32-char hex without hyphens).

### What HRPAuth does internally

HRPAuth's `/register` runs an upsert keyed by `mojang_uuid` first, then by `username` (v0.2 行为，含 `mbe` 分支)：

```
if mojang_uuid is bound to user U:
    return U (idempotent)
elif username exists and its mojang_uuid is NULL:
    # v0.2 新增 mbe 分支：mbe=0 时 HA 优先拒绝；mbe=1 才允许 bind
    if user.mbe == 0:
        409 (collision; HA 优先, Mojang 玩家被踢)
    else:  # user.mbe == 1
        bind mojang_uuid to that user
        # 注意：仅写 mojang_uuid + last_sign_at；password/email/cbh **保留不变**
        return that user
elif username exists and its mojang_uuid is some other UUID:
    409 (collision; this Mojang player is trying to take an already-bound identity)
else:
    create new user with cbh=0 and placeholder email (mbe 默认 0)
    return new user
```

`mbe` 字段默认 `0`，玩家需在 HRPAuth WebUI 主动调 `POST /user/mojang-bind-enable` 设为 `1` 才会允许同名 Mojang 玩家撞名 bind。详见 [HA-ROADMAP §3.4](../HA-ROADMAP.md#34-业务逻辑仅-mt-路径生效v02-按-mbe-分支) 与 [`POST /user/mojang-bind-enable`](../HA-ROADMAP.md#36-新增端点post-usermojang-bind-enablev02-新增)。

### What WinnerProxy does with the response

Compose:

```json
{
  "id": "<response.profile_id>",
  "name": "<Mojang 原名 / POST /register 请求体 username>",
  "properties": "<mojangProfile.properties — Mojang-signed>"
}
```

> 注：HA 响应字段为 `success, uid, message, profile_id`（M.T. 新建代注册时附加 `cbh: 0`），**不包含 `username`**。`name` 直接用 WinnerProxy 在 Stage 3 调 `/register` 时已知的 `mojangProfile.name`（即输入 username），保证与请求体一致。

**Note**: `id` and `name` are from HRPAuth (so the Minecraft server sees a stable HRPAuth identity). `properties` is from Mojang (so the player's Mojang skin renders correctly).

The Minecraft client will:
- Use `id` as the player's UUID (HRPAuth's)
- Use `properties` to render the skin (Mojang's)
- Verify the `properties[*].signature` using Mojang's built-in public key (because Mojang signed them, not HRPAuth)

This works for vanilla Minecraft. **Caveat**: plugins like BungeeGuard that re-verify the entire `PlayerProfile` object against a custom Yggdrasil public key will not work in v0.2; that's tracked as a v0.3 feature.

## Failure matrix

| Stage | Upstream response | WinnerProxy response | Log level |
|---|---|---|---|
| 1 | 200 + profile | 200 + HRPAuth profile | INFO (debug only) |
| 1 | 204 | (fall through to Stage 2) | DEBUG |
| 1 | 5xx / network | (fall through to Stage 2) | WARN |
| 2 | 200 + mojangProfile | (continue to Stage 3) | DEBUG |
| 2 | 204 | 204 | INFO |
| 2 | 5xx / network | 204 | WARN |
| 3 | 200 + registerResponse | 200 + composed profile | INFO |
| 3 | 409 (username_already_bound) | 204 | WARN (collision) |
| 3 | 400 (invalid_mojang_uuid) | 500 | ERROR (programming error) |
| 3 | 5xx / network | 503 | ERROR |

## Examples

### Example 1: HRPAuth user Alice joins via HRPAuth password

```
1. Minecraft server calls hasJoined(username=Alice, serverId=...)
2. WinnerProxy → HRPAuth /hasJoined → 200 + {id: <HRPAuth Alice UUID>, name: "Alice", properties: [HRPAuth skin]}
3. WinnerProxy returns 200 + that profile.
4. Minecraft server accepts, Alice is in.
```

### Example 2: HRPAuth user Alice joins via Mojang (same person, different login)

This is the same as Example 1, but Alice used the official Minecraft launcher instead of HRPAuth:

```
1. Minecraft server calls hasJoined(username=Alice, serverId=...)
2. WinnerProxy → HRPAuth /hasJoined → 204 (no HRPAuth session)
3. WinnerProxy → Mojang /hasJoined → 200 + {id: <Mojang Alice UUID>, ...}
4. WinnerProxy → HRPAuth /register (M.T.) → 200 + {profile_id: <HRPAuth Alice UUID>, ...}
5. WinnerProxy returns 200 + {id: <HRPAuth Alice UUID>, name: "Alice", properties: [Mojang skin]}.
6. Minecraft server sees the same UUID as in Example 1; Alice is in.
```

### Example 3: New Mojang player Bob (never registered with HRPAuth) joins

```
1. Minecraft server calls hasJoined(username=Bob, serverId=...)
2. WinnerProxy → HRPAuth /hasJoined → 204
3. WinnerProxy → Mojang /hasJoined → 200 + {id: <Mojang Bob UUID>, ...}
4. WinnerProxy → HRPAuth /register (M.T., mojang_uuid=<Mojang Bob UUID>) → 200 + {profile_id: <new HRPAuth Bob UUID>, cbh: 0, ...}    // cbh=0 仅在新建代注册时返回
5. WinnerProxy returns 200 + {id: <new HRPAuth Bob UUID>, name: "Bob", properties: [Mojang skin]}.
6. Minecraft server accepts, Bob is in.
7. HRPAuth now has a user with username=Bob, mojang_uuid=<Mojang Bob UUID>, cbh=0, email=bob@mojang-imported.invalid.
```

If Bob never comes back for 30 days, HRPAuth's cleanup routine deletes this account.

### Example 4: Malicious Mojang player tries to impersonate HRPAuth user Alice

```
1. Attacker renames their Mojang account to "Alice" (or buys Mojang account named "Alice")
2. Minecraft server calls hasJoined(username=Alice, serverId=...)
3. WinnerProxy → HRPAuth /hasJoined → 204 (HRPAuth user Alice is offline)
4. WinnerProxy → Mojang /hasJoined → 200 + {id: <Mojang Alice UUID>, ...}  (this is the attacker's Mojang UUID)
5. WinnerProxy → HRPAuth /register (M.T., mojang_uuid=<attacker Mojang UUID>) →
     - 若 HRPAuth user Alice.mojang_uuid 已绑 <real Alice Mojang UUID> → 409
     - 若 HRPAuth user Alice.mojang_uuid IS NULL：
         ├ Alice.mbe = 0（默认）→ 409 (HA 优先, 攻击者被踢)
         └ Alice.mbe = 1（玩家主动开启）→ 200 + bind, Alice.mojang_uuid 被覆盖为攻击者 UUID
6. 默认场景：WinnerProxy logs WARN, returns 204. Minecraft server kicks the attacker.
```

This protection relies on **HRPAuth user Alice having either already bound their Mojang account, or having `mbe=0` (default)**. If Alice's `mbe=1` and her `mojang_uuid` is `NULL`, the attacker's Mojang-named "Alice" will be allowed to bind first (since `mbe=1` opens the door) — this is the intentional "owner opted in" trade-off, and can be reverted by re-binding the correct Mojang UUID in HRPAuth WebUI. See [Troubleshooting](./troubleshooting.md#how-do-players-bind-mojang-to-hrpauth).

## Why three stages and not a single one?

- **Why HRPAuth first?** Faster (LAN/localhost), and HRPAuth players are the "happy path" of this design.
- **Why fall back to Mojang?** The whole point: a Mojang player can join an HRPAuth-only server.
- **Why proxy-register in stage 3?** Because HRPAuth is the source of truth. The Minecraft server must see an HRPAuth UUID; we cannot return a Mojang UUID directly.
- **Why not also call Mojang if HRPAuth is 200?** Two authentications in flight is an edge case we treat as "HRPAuth wins". The Minecraft server only validates one session at a time anyway.
