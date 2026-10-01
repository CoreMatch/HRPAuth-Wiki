---
title: Token 与鉴权体系
description: 理解站内 OAuth2、Yggdrasil Token、验证码与 TOTP 的关系与边界。
order: 5
tags:
  - token
  - auth
  - security
updatedAt: 2026-09-08
---

# Token 与鉴权体系

HRPAuth 的复杂度主要来自"一个服务里有多套凭证系统"。本节旨在理清各类 Token 的生命周期、作用域及其相互关系。

## 1. Token 一览表

| 名称 | 字段名 | 长度 | 作用范围 | 颁发接口 | 使用接口 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **OAuth2 Access Token** | `access_token` | 32 字节随机 | 站内业务 API 凭证 | `/oauth/token`, `/totp/verify` | `/logout`, `/user`, `/change-*`, `/texture/*` |
| **OAuth2 Refresh Token** | `refresh_token` | 32 字节随机 | 站内业务续期 | `/oauth/token`, `/totp/verify` | `/oauth/token` (grant_type=refresh_token) |
| **OAuth2 Login Ticket** | `login_ticket` | 24 字节随机 | TOTP 二步登录临时凭据 | `/oauth/login-ticket` | `/totp/verify` |
| **Yggdrasil Access Token** | `accessToken` | 随机 | Minecraft 客户端会话 | `/authserver/authenticate` | `/sessionserver/session/minecraft/join` |
| **内置超级客户端密钥** | `client_secret` | 32 字节随机 | 服务间通信 (client_credentials) | 静态配置 | `/oauth/token` |

---

## 2. 站内业务体系 (OAuth2)

站内业务接口现已全面切换为 **OAuth2 Bearer Token** 鉴权。原有的 `Remember Token` 体系已正式进入 Legacy 模式。

### 2.1 鉴权头格式
所有需要鉴权的业务接口均需在 HTTP Header 中携带：
```http
Authorization: Bearer <access_token>
```

### 2.2 第一方登录链路 (Login Ticket)
为了安全支持 TOTP，我们不直接在登录接口返回 Token，而是采用以下流程：
1. 调用 `POST /oauth/login-ticket` 进行密码校验。
2. 若用户开启了 TOTP，系统返回 `login_ticket`；若未开启，则直接返回 OAuth2 Token。
3. 携带 `login_ticket` 与用户输入的 `passcode` 调用 `POST /totp/verify` 换取最终的 Access Token。

---

## 3. Yggdrasil 体系

Yggdrasil 体系与站内 OAuth2 体系**完全隔离**。

### 3.1 状态机与互踢逻辑
Yggdrasil Token (`accessToken`) 存在三种状态：
- `valid`: 完全有效。
- `temporarily_invalid`: 被其他客户端抢占，只能通过 `/refresh` 尝试找回。
- `invalid`: 永久失效。

**互踢规则**：当同一个用户使用不同的 `clientToken` 登录时，旧的 `valid` Token 会被标记为 `temporarily_invalid`。这允许玩家在更换设备后，通过客户端的刷新逻辑重新获得会话控制权。

### 3.2 单用户 Token 数量上限

按照 Yggdrasil 规范，单个用户允许同时持有多个 `accessToken`，但服务端应对数量加以限制。HRPAuth 在 `yggdrasil.security.max_tokens_per_user`（默认 `10`）生效：

- 每次 `/authenticate` 或 `/refresh` 创建新 Token 前，会检查当前用户的 `valid` Token 数量。
- 若已达上限，**最早颁发的** `valid` Token 会被标记为 `invalid`（按 `issued_at` 升序淘汰），再插入新 Token。
- `temporarily_invalid` 和 `invalid` 不计入数量上限。
- 被踢到 `temporarily_invalid` 的 Token 仍能通过 `/refresh` 找回，不会因为数量限制而提前被淘汰。

> 实现位于 `services/auth_service.go::EnforceTokenLimit`，在 `CreateToken` 之前自动调用。

### 3.3 Signout 的速率限制

`POST /authserver/signout` 接受用户名 + 密码，与 `/authenticate` 同样会被滥用为密码枚举接口，因此现在共享同一套 Redis 限流计数器（`security.rate_limit_max_attempts` / `security.rate_limit_window_sec`）。超过阈值后直接返回 `403 ForbiddenOperationException`，与 `/authenticate` 一致。

---

## 4. OAuth2 Token 生命周期

站内 OAuth2 Token（Access Token、Refresh Token、Authorization Code）与 Yggdrasil Token **完全隔离**，拥有独立的过期、清理与并发防护机制。

### 4.1 过期与清理

| 清理目标 | 过期条件 | 清理周期 | 控制器 |
|:---|:---|:---|:---|
| Access Token | `expires_at < now()` 或 `revoked_at IS NOT NULL` | 24 小时 | `OAuth2CleanupController` |
| Authorization Code | `expires_at < now()` | 24 小时 | `OAuth2CleanupController` |

> 已消费的 Authorization Code 由 `consumed_at` 字段标记，但默认 TTL 仅 5 分钟，过期条件已完全覆盖消费场景，无需单独清理。

Yggdrasil Token 由独立的 `TokenCleanupController` 负责，每小时执行，清理 `invalid` 状态或过期记录。

### 4.2 并发竞态防护

`ExchangeAuthorizationCode`（授权码换 Token）和 `RefreshUserToken`（刷新 Token）均可能被并发请求触发。为防止重复消费/刷新，两处均采用**原子 UPDATE**：

```sql
-- 授权码消费
UPDATE oauth2_authorization_codes
   SET consumed_at = ?
 WHERE code = ? AND consumed_at IS NULL AND expires_at > ?

-- Refresh Token 轮换
UPDATE oauth2_refresh_tokens
   SET revoked_at = ?
 WHERE refresh_token = ? AND revoked_at IS NULL AND expires_at > ?
```

首个并发请求成功影响 1 行，后续并发请求 `RowsAffected == 0`，返回 `ErrOAuthInvalidGrant`。原子 UPDATE 在数据库层保证唯一性，无需应用层锁，多实例部署也安全。

### 4.3 撤销机制

- 登出时通过 `RevokeAccessToken` 设置 `revoked_at`（软删除）。
- 刷新 Token 时，旧 Refresh Token 被原子标记 `revoked_at`。
- 清理任务批量物理删除已过期或已撤销的记录。

---

## 5. 常见问题与边界

- **跨体系调用**：站内 Access Token 不能用于 Yggdrasil 接口（如 join），反之亦然。
- **服务代操作**：微服务通过 `client_credentials` 获取的 Token 必须配合 `uid` 或 `email` 参数，并具备相应的 `scope`（如 `user.manage`）。
- **数据库 scope**：`db.line.read`、`db.line.write`、`db.line.delete`、`db.table.create`、`db.table.delete` 这些 scope 默认不包含在内置超级客户端中。如需使用，须在 `config.yaml` 的 `oauth2.super_client_extra_scopes` 中手动添加。
- **Yggdrasil 清理机制**：系统每小时会自动清理 `invalid` 状态或已过期的所有 Yggdrasil Token。
- **OAuth2 清理机制**：系统每 24 小时清理已过期/已撤销的 OAuth2 Access Token 及已过期的 Authorization Code。
- **Refresh 响应差异**：`POST /authserver/refresh` 的响应字段为 `accessToken`、`clientToken`、`selectedProfile`（按需附加 `user`），不再返回 `availableProfiles`。
