---
title: HASkinProxy API Reference
description: "HTTP endpoints exposed by HASkinProxy: CSL profile/texture proxy plus texture-management passthrough."
order: 1
updatedAt: 2026-09-04
---

# API Reference

HASkinProxy exposes five HTTP endpoints:

- 1 health probe
- 2 SDK / dashboard surface endpoints (relayed by HRPAuth)
- 2 CSL proxy endpoints
- 1 texture-management passthrough endpoint

## Conventions

- **Base URL**: `http://<server.listen_addr>` (default `http://localhost:2702`)
- **CSL endpoints**: root paths (no prefix)
- **Content-Type**: CSL endpoints respond `application/json` or `image/png`; the delete endpoint is `application/json` for both directions
- **Error body**: `{"error": "..."}` with 4xx / 5xx
- **Authentication**: HASkinProxy itself does **not** authenticate requests. The `Authorization` header is forwarded verbatim to HRPAuth for endpoints that need it.

---

## `GET /health`

Liveness probe. **No upstream access**.

**Response 200**:

```json
{ "status": "ok" }
```

---

## `GET /sdk/haskinproxy.js`

Returns the JS SDK consumed by the WEBUI dashboard. Reached by browsers via the main service origin (`/sdk/haskinproxy.js` is a relay rule pointing back to this proxy). No upstream call.

---

## `GET /customskinloader`

HTML setup page embedded in the WEBUI dashboard for CustomSkinLoader configuration. No upstream call.

---

## `GET /:username`

Returns the CSL profile for the given username. Implementation:

1. `POST /api/profiles/minecraft` upstream → resolve `username` to UUID.
2. `GET /sessionserver/session/minecraft/profile/:uuid` upstream → fetch the full session profile.
3. Decode the base64 `textures` property, extract `SKIN` / `CAPE` / `ELYTRA` URLs, and re-package them as `{ "<model|default>": "<hash>", ... }`.

The result is cached under `profile:{username}` for `cache.profile_ttl` seconds.

**Path parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `username` | string | yes | Minecraft username. Must end with `.json` (the CSL client appends it). |

**Response 200**:

```json
{
  "username": "Notch",
  "textures": {
    "default": "abc123...",
    "cape": "def456..."
  }
}
```

**Response 404**: username or profile not found in upstream.

---

## `GET /textures/:hash`

Returns the raw texture bytes for the given hash. The bytes are fetched from the upstream `/textures/:hash` endpoint on cache miss and stored under `tex:{hash}` for `cache.texture_ttl` seconds.

**Response headers**: `Content-Type`, `Last-Modified`, `Cache-Control` are forwarded from the upstream. `X-Cache: HIT` is set on cache hits.

**Response 404**: hash not found upstream.

---

## `POST /:username/texture/delete`

Forwards the request body to HRPAuth's `POST /texture/delete` and returns the upstream response (status + body) unchanged. The `Authorization` header is also forwarded unchanged. HASkinProxy itself performs **no** authentication for this endpoint.

`:username` is used only to evict the local cache on success; it is **not** sent to the upstream.

### Request body

The body is the upstream `POST /texture/delete` request body, passed through verbatim:

```json
{
  "remember_token": "<Remember Token or Manage Token>",
  "profile_id": "<uuid>",
  "texture_type": "skin",
  "auth_type": "remember",
  "uid": "...",
  "email": "..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `remember_token` | string | yes | Bearer token (Remember Token or Manage Token). |
| `profile_id` | string | no | Character UUID. Defaults to the user's first profile when omitted. |
| `texture_type` | string | yes | `skin` or `cape`. |
| `auth_type` | string | Manage Token only | Must be `"manage"` when using a Manage Token. |
| `uid` | string | Manage Token only | Target user UID (mutually exclusive with `email`). |
| `email` | string | Manage Token only | Target user email (mutually exclusive with `uid`). |

### Response

The upstream response is forwarded as-is:

```json
{
  "success": true,
  "message": "Texture deleted",
  "data": { "profile_id": "...", "texture_type": "skin" }
}
```

The HTTP status code is also forwarded (200, 400, 401, 403, 404, 500).

### Cache eviction

On upstream success (2xx):

- `profile:{username}` is removed from the local cache.
- All `tex:{hash}` entries belonging to that profile (captured before the upstream call) are removed.

On non-success, no eviction is performed.

### Examples

Player mode (deleting their own skin):

```
POST /Notch/texture/delete
Authorization: Bearer <Remember Token>
Content-Type: application/json

{ "remember_token": "<Remember Token>", "profile_id": "<uuid>", "texture_type": "skin" }
```

Manage Token mode (deleting another user's cape):

```
POST /Notch/texture/delete
Authorization: Bearer <Manage Token>
Content-Type: application/json

{ "remember_token": "<Manage Token>", "texture_type": "cape", "auth_type": "manage", "uid": "42" }
```