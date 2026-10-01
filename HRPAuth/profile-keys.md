---
title: Profile Keys (聊天签名)
description: HRPAuth 对 Minecraft 1.19+ 聊天签名 (Profile Key) 特性的实现与运维说明。
order: 9
tags:
  - profile-key
  - minecraft
  - yggdrasil
  - chat-signing
updatedAt: 2026-09-07
---

# Profile Keys (聊天签名)

从 Minecraft 1.19 开始，聊天消息会携带数字签名。客户端在登录后向 Yggdrasil 服务器请求一对 RSA 密钥，然后使用私钥给聊天消息签名；服务端用对应的公钥验签。

HRPAuth 通过 `enable_profile_key` 开关启用该能力，并在 `profile_keys` 表中持久化每个用户的密钥对。

## 启用

```yaml
yggdrasil:
  feature_flags:
    enable_profile_key: true
```

> 启用前请确认 `yggdrasil.server.signature_public_key_path` 与 `signature_private_key_path` 已经存在有效密钥；Profile Key 公钥会使用该私钥签名，复用现有纹理签名密钥。

## 端点

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `POST` | `/minecraftservices/player/certificates` | `Authorization: Bearer <yggdrasil accessToken>` | 颁发或返回当前用户的聊天签名密钥对 |
| `GET` | `/minecraftservices/publickeys` | 无 | 返回签名公钥（Mojang 信封格式） |

### `/player/certificates` 请求

```http
POST /minecraftservices/player/certificates
Authorization: Bearer <yggdrasil accessToken>
```

请求体为空。响应：

```json
{
  "keyPair": {
    "privateKey": "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----",
    "publicKey":  "-----BEGIN RSA PUBLIC KEY-----\n...\n-----END RSA PUBLIC KEY-----"
  },
  "publicKeySignature":   "<base64>",
  "publicKeySignatureV2": "<base64>",
  "expiresAt":            "2026-09-09T12:00:00Z",
  "refreshedAfter":       "2026-09-09T04:00:00Z"
}
```

> 客户端在 `refreshedAfter` 之后会自动再来领取新密钥对；HRPAuth 在 `refreshedAfter` 之后、`expiresAt` 之前会重新生成密钥对（避免每次都换）。

错误响应：

| 状态 | 场景 |
| --- | --- |
| `403 ForbiddenOperationException` | `enable_profile_key` 未开启 |
| `401 Unauthorized` (Mojang 信封) | 缺少 accessToken 或 token 已失效 |

### `/publickeys` 请求

```http
GET /minecraftservices/publickeys
```

响应：

```json
{
  "playerCertificateKeys": [{ "publicKey": "<base64(DER SubjectPublicKeyInfo)>" }],
  "profilePropertyKeys":   [{ "publicKey": "<base64(DER SubjectPublicKeyInfo)>" }],
  "authenticationKeys":    [{ "publicKey": "<base64(DER SubjectPublicKeyInfo)>" }]
}
```

`publicKey` 字段是 **Base64(DER SubjectPublicKeyInfo)**，与 Mojang 内嵌在 authlib-injector 中的 `yggdrasil_session_pubkey.der` 等价。

## 数据模型

存储于 `profile_keys` 表（迁移 `000004_profile_keys.up.sql`），关键字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user_id` | varchar(32) | 一对一关联 `users.uuid`，UNIQUE 索引 |
| `public_key` / `private_key` | text | PEM 格式的 RSA 2048 密钥对 |
| `public_key_signature` | text | Yggdrasil 签名私钥对公钥的 SHA1withRSA 签名 |
| `expires_at` | datetime | 颁发 + 48h |
| `refreshed_after` | datetime | 颁发 + 40h |

## 轮换策略

- 同一用户每次 `/player/certificates` 请求都会先复用现有的密钥对（当 `expires_at > now + 8h`）。
- 当密钥接近过期时（`expires_at ≤ now + 8h`）会自动轮换生成新密钥。
- 已过期的密钥对在下次请求时被替换，不会保留历史。
- 当前实现没有后台清理已过期行；如需清理可调用 `services/profile_key_service.go::CleanupExpired`。

## 与服务器端的协同

HRPAuth 使用与纹理签名相同的 RSA 私钥对 Profile Key 公钥进行签名，因此：

- `GET /` 中的 `signaturePublickey` 同时作为纹理属性签名和 Profile Key 签名的信任根。
- 客户端只需获取一次 `signaturePublickey` 即可验证两类签名。

## 调试

- 客户端报 "Profile key not found"：通常是 `enable_profile_key` 没开，或 service token 误用为 access token。
- `401 Unauthorized`：检查 access token 是否过期，可调 `/authserver/refresh` 续期。
- 密钥对频繁轮换：确认客户端不会因为自身配置错误反复拒绝 `expiresAt` 之前的密钥。