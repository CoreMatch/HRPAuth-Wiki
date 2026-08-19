---
title: WinnerProxy 故障排查
description: WinnerProxy 常见问题、日志说明与解决方案
order: 6
updatedAt: 2026-08-15
---

# Troubleshooting / 故障排查

> 中英双语。中文在前，英文在后。  
> Bilingual. Chinese first, English second.

---

## 中文

### 三条快速检查

```bash
# 1. WinnerProxy 自身
curl http://127.0.0.1:2779/health
# → {"status":"ok"}

# 2. HRPAuth 可达
curl http://hrpauth-host:2880/
# → Yggdrasil meta JSON

# 3. Mojang 出站可达
curl -sI 'https://sessionserver.mojang.com/session/minecraft/hasJoined?username=Notch'
# → 204/200（204 是正常的，Notch 不在线）
```

任一条挂了就先修底层连通。

---

### 玩家全部进不去

**症状**：每个玩家都被踢，提示 `Failed to verify username`。

**可能原因**：
1. Minecraft 服务端 `server.properties` 没设 `yggdrasil-api-url`：
   ```properties
   online-mode=true
   yggdrasil-api-url=http://your-winnerproxy:2779/yggdrasil
   ```
2. WinnerProxy 连不到 HRPAuth：日志里找 `hrpauth hasJoined error, falling back to mojang: ...` 或 `hrpauth register failed: ...`。
   ```bash
   curl -v 'http://hrpauth-host:2880/sessionserver/session/minecraft/hasJoined?username=test&serverId=deadbeef'
   ```
3. WinnerProxy 连不到 Mojang：日志里找 `mojang hasJoined failed`（proxy.MojangService 内部错误）。
4. 出站 HTTPS 被防火墙拦。某些机房按 IP 段封，把 `sessionserver.mojang.com` 和 `api.minecraftservices.com` 加白。

---

### 玩家进服几秒后被踢（皮肤加载失败）

**症状**：玩家进了服但皮肤是默认 Steve/Alex，过几秒被踢。

**原因**：`hasJoined` 响应里的 `properties` 数组是空或畸形。Mojang 端可能返 502/503/解析错误。

**处理**：
- 确认 Mojang 可达（同上）
- 确认玩家确实是 Mojang 玩家（离线模式玩家没 Mojang skin，`properties` 本就为空，那是预期行为）

---

### 玩家改名后游戏内 UUID 变了

**症状**：Mojang 玩家 "Alice" 改名为 "Alice2"，重启后游戏内身份跟以前不一样。

**这是预期行为**：游戏内 UUID 是 **HRPAuth UUID**，不是 Mojang UUID。HRPAuth 身份在 Mojang 改名时**不自动跟随**。

完整流程：
1. Stage 1：HRPAuth `hasJoined` for `Alice2` → 204
2. Stage 2：Mojang `hasJoined` for `Alice2` → 200（新 Mojang UUID）
3. Stage 3：HRPAuth `/register` 新 `mojang_uuid` → HRPAuth 找不到 `Alice2`，新建一个 `cbh=0` 账号

**玩家处理**：去 HRPAuth WebUI 改自己账户的 username，保留旧 HRPAuth 身份。

---

### 玩家解绑 Mojang 后进不去

**症状**：玩家在 HRPAuth WebUI 取消绑定 Mojang。下次 Minecraft 登录失败。

**原因**：解绑后 `users.mojang_uuid = NULL`。下次进服走 Stage 3 时进入决策树 2.a（v0.2 `mbe` 分支）：

- **`mbe = 0`（默认）** → 409 `username_already_bound` → WinnerProxy 返 204 + WARN，玩家**进不去**
- **`mbe = 1`（玩家主动开启）** → 200 + bind，HA 自动用新 Mojang UUID 重新绑定

**处理**：
- 让玩家去 HRPAuth WebUI 调 `POST /user/mojang-bind-enable` 把 `mbe=1`（见 [玩家怎么绑 Mojang](#玩家怎么把-mojang-账号绑到-hrpauth)），再走一次登录。
- 若开 `mbe=1` 仍 409：解绑后该 username 已被其他 Mojang 玩家抢注（同名号被买走/改了名），需先在 HRPAuth WebUI 手动 re-bind 正确的 Mojang UUID。

---

### 日志里出现 `username_already_bound, rejecting mojang player`

**症状**：
```
username_already_bound, rejecting mojang player: name=Alice uuid=f7c77d99...
```

**含义**：Mojang 玩家想以 "Alice" 进服，但 HRPAuth 已有用户 `Alice`，其 `mojang_uuid` 绑的是**另一个** Mojang UUID。**新进服被拒绝**。

**排查**：
1. 查 HRPAuth `users` 表里 `username='Alice'` 那一行，记录它的 `mojang_uuid`。
2. 和日志里的 `uuid=` 比较。
3. 不同 → 有人想冒名顶替。

**处理**：
- 玩家合法但换了 Mojang 号：让他先去 HRPAuth WebUI 重新绑新 Mojang UUID。
- 玩家是攻击者：无需任何操作，WinnerProxy 已经在保护了。

---

### 玩家每次进服 UUID 都变

**症状**：每次进服都显示成一个新玩家，UUID 不同、背包空、无历史。

**原因**：Stage 3 每次都新建 HRPAuth 用户，找不到已存在的。

**排查**：
1. 查 HRPAuth 日志：是否每次 `/register` 调时都带 `mojang_uuid`？
2. 看响应：返的是 `cbh: 0`（新建）还是 `cbh: 1`（已存在）？
3. 若永远 `cbh: 0`：
   - 请求里的 `mojang_uuid` 字段值（32 hex chars, no hyphens）和 HRPAuth `users.mojang_uuid` 是否一致
   - HRPAuth `/register` 的 upsert 逻辑是否正确先按 `mojang_uuid` 查

**处理**：联系 HRPAuth 侧核对 `/register` 的 upsert 行为。

---

### 日志里出现 `hrpauth register failed`

**症状**：玩家有时进不去，日志有 `hrpauth register failed: ...`。

**原因**：Stage 3 时 HRPAuth 不可达或太慢。

**处理**：
- 调高 `upstreams.hrpauth.timeout_sec`（默认 10s）
- 排查 HRPAuth 性能
- 跨主机的话查网络

---

### `/health` 200 但所有 Yggdrasil 请求失败

**症状**：`/health` 返 200，但 `hasJoined` 全部失败。

**原因**：`yggdrasil` 路由组没注册上，或路径不对。

**处理**：
- 确认 `yggdrasil-api-url` **带 `/yggdrasil` 后缀**：
  ```properties
  yggdrasil-api-url=http://winnerproxy:2779/yggdrasil   # 注意后缀
  ```
- 看 WinnerProxy 日志是否有 `/yggdrasil/sessionserver/...` 请求。没 → URL 配错了。

---

### 日志里出现 `hrpauth hasJoined error, falling back to mojang`

**症状**：每次 `hasJoined` 都打这条。

**含义**：HRPAuth 端返了 5xx / 网络错。WinnerProxy 继续走 Stage 2（Mojang 兜底），所以**玩家仍可能进服**，但每个请求都多打一条 WARN。

**处理**：
- 查 HRPAuth 健康
- 网络层排查（HRPAuth 端口、路由）
- 长期出现 → 调大 `upstreams.hrpauth.timeout_sec`

---

### 日志里出现 `generate password failed`

**症状**：极少出现；意味着 `crypto/rand` 失败。

**原因**：系统熵源耗尽（嵌入式 / 容器无 urandom 设备等）。

**处理**：换主机。`crypto/rand` 失败是 OS 级问题，不在 WinnerProxy 处理范围。

---

### 玩家怎么把 Mojang 账号绑到 HRPAuth？

HRPAuth v0.2 引入 `mbe`（Mojang Bind Enabled）字段控制同名 Mojang 玩家撞名 bind 的策略：

- `mbe = 0`（默认）：HRPAuth 优先。未绑 Mojang 的 HRPAuth 用户，遇到同名 Mojang 玩家进服，HA `/register`（服务模式路径）返 409 `username_already_bound`，Mojang 玩家被踢。
- `mbe = 1`（玩家主动开启）：允许同名 Mojang 玩家 bind 到本 HRPAuth 用户；bind 时**仅写 `mojang_uuid` + `last_sign_at`**，**保留 `password` / `email` / `cbh` 不变**。

#### 玩家自助开（推荐）

登录 HRPAuth WebUI 授权后，使用 Bearer Token 调：
```http
POST /user/mojang-bind-enable
Authorization: Bearer <Access Token>
Content-Type: application/json
```

成功后该用户的 `mbe` 置 1。**幂等**。

#### 运维代开

玩家无法自助时，运维使用具备 `admin:user.write` 权限的 **Service Token** 代开：
```http
POST /user/mojang-bind-enable
Authorization: Bearer <Service Token>
Content-Type: application/json

{ "uid": "42" }
```

或：
```http
{ "email": "alice@example.com" }
```

> `uid` 与 `email` 二选一；都缺则 HA 返 400。
> 注意：开 `mbe=1` 后**不撤销**。若要锁回 `mbe=0`，目前需直接 SQL 更新（HA 暂无 disable 端点）。

---

### 其他

#### 想用假 Mojang 端测试

`config.yml` 关掉官方 Mojang：
```yaml
upstreams:
  official:
    enabled: false
```
然后本地起个 mock 服务模拟 Mojang `hasJoined 200`。

#### 多个 WinnerProxy 实例放 LB 后面？

可以，但有代价：
- `cache` 是 per-instance，缓存命中率下降
- HRPAuth Service Token 共用，所有实例用同一个 `client_secret`
- 不需要状态同步，多个实例对 HRPAuth 的最终状态一致

单实例一般够用。

#### 怎么轮换 Service Token？

1. 在 HRPAuth `config.yaml` 生成新的 `oauth2.super_client_secret`
2. 改 WinnerProxy `config.yml` 中的 `upstreams.hrpauth.client_secret`
3. `systemctl restart winnerproxy`
4. 重启期间老实例 auth 失败、新实例用新 token——约 5–10 秒不可用

---

## English

### Three quick checks

```bash
# 1. WinnerProxy itself
curl http://127.0.0.1:2779/health
# → {"status":"ok"}

# 2. HRPAuth reachable
curl http://hrpauth-host:2880/
# → Yggdrasil meta JSON

# 3. Mojang outbound
curl -sI 'https://sessionserver.mojang.com/session/minecraft/hasJoined?username=Notch'
# → 204/200 (204 is fine; Notch is offline)
```

If any of these fail, fix the underlying connectivity first.

---

### All players get kicked

**Symptom**: every player is kicked with `Failed to verify username`.

**Likely causes**:
1. The Minecraft server's `server.properties` has no `yggdrasil-api-url`:
   ```properties
   online-mode=true
   yggdrasil-api-url=http://your-winnerproxy:2779/yggdrasil
   ```
2. WinnerProxy can't reach HRPAuth: look for `hrpauth hasJoined error, falling back to mojang: ...` or `hrpauth register failed: ...` in the log.
   ```bash
   curl -v 'http://hrpauth-host:2880/sessionserver/session/minecraft/hasJoined?username=test&serverId=deadbeef'
   ```
3. WinnerProxy can't reach Mojang: look for `mojang hasJoined failed` in the log.
4. Outbound HTTPS blocked. Some data centers block Mojang by IP. Whitelist `sessionserver.mojang.com` and `api.minecraftservices.com`.

---

### Players kicked after a few seconds (skin fails)

**Symptom**: Player logs in but skin is the default Steve/Alex, then kicked after a few seconds.

**Cause**: `properties` in the `hasJoined` response is empty or malformed. Mojang may have returned 502/503 or a parse error.

**Fix**:
- Confirm Mojang is reachable (see above).
- Confirm the player is a real Mojang player (offline-mode players have no Mojang skin; an empty `properties` is expected for them).

---

### Player renamed on Mojang — in-game UUID changed

**Symptom**: Mojang player "Alice" renamed to "Alice2". On next login, in-game identity is different from before.

**This is intentional**: the in-game UUID is the **HRPAuth UUID**, not the Mojang UUID. The HRPAuth identity does **not** track Mojang renames.

Full flow:
1. Stage 1: HRPAuth `hasJoined` for `Alice2` → 204
2. Stage 2: Mojang `hasJoined` for `Alice2` → 200 (new Mojang UUID)
3. Stage 3: HRPAuth `/register` with new `mojang_uuid` → HRPAuth has no `Alice2`, creates a new `cbh=0` user

**Fix (for the player)**: in HRPAuth WebUI, update the Minecraft username on their account to keep the in-game identity.

---

### Player unbound Mojang — can't rejoin

**Symptom**: Player unlinked their Mojang account in HRPAuth. On next Minecraft login, can't get back in.

**Why**: after unbind, `users.mojang_uuid = NULL`. Next login enters the 2.a branch (v0.2 `mbe` split) at Stage 3:

- **`mbe = 0` (default)** → 409 `username_already_bound` → WinnerProxy returns 204 + WARN; **player is rejected**
- **`mbe = 1` (player opted in)** → 200 + bind; HA auto-binds the new Mojang UUID

**Fix**:
- Ask the player to call `POST /user/mojang-bind-enable` in HRPAuth WebUI to set `mbe=1` (see [How do players bind Mojang to HRPAuth?](#how-do-players-bind-mojang-to-hrpauth)), then log in again.
- If still 409 after `mbe=1`: the username may have been claimed by another Mojang player (bought / renamed to the same name). Re-bind the correct Mojang UUID manually in HRPAuth WebUI.

---

### Log: `username_already_bound, rejecting mojang player`

**Symptom**:
```
username_already_bound, rejecting mojang player: name=Alice uuid=f7c77d99...
```

**What it means**: a Mojang player is trying to join as "Alice", but HRPAuth already has a user "Alice" whose `mojang_uuid` is bound to a **different** Mojang UUID. The new join is rejected.

**Investigate**:
1. Find HRPAuth's `users` row where `username='Alice'`. Note its `mojang_uuid`.
2. Compare to the `uuid=` in the log.
3. Different → someone is trying to impersonate "Alice".

**Fix**:
- Legitimate player with a new Mojang account: ask them to rebind their new Mojang UUID in HRPAuth WebUI first.
- Attacker: no action needed; WinnerProxy is doing the right thing.

---

### Player gets a fresh UUID every time

**Symptom**: each login creates a new player (different UUID, empty inventory, no history).

**Cause**: Stage 3 is creating a new HRPAuth user every time, not finding the existing one.

**Investigate**:
1. Check HRPAuth log: was `/register` called with `mojang_uuid`?
2. Check the response: was it `cbh: 0` (new) or `cbh: 1` (existing)?
3. If always `cbh: 0`:
   - The `mojang_uuid` in the request (32 hex chars, no hyphens) matches `users.mojang_uuid` in HRPAuth?
   - HRPAuth's `/register` upsert correctly checks `mojang_uuid` first?

**Fix**: coordinate with the HRPAuth team to verify the upsert logic in `/register`.

---

### Log: `hrpauth register failed`

**Symptom**: intermittent auth errors; log shows `hrpauth register failed: ...`.

**Cause**: HRPAuth is down or slow at Stage 3. `upstreams.hrpauth.timeout_sec` may be too aggressive.

**Fix**:
- Raise `upstreams.hrpauth.timeout_sec` (default 10s).
- Investigate HRPAuth performance.
- If HRPAuth is on a separate host, check the network.

---

### `/health` is 200 but every Yggdrasil request fails

**Symptom**: `/health` returns 200, `hasJoined` fails.

**Cause**: the `yggdrasil` route group is not mounted, or the path is wrong.

**Fix**:
- Confirm `yggdrasil-api-url` **includes `/yggdrasil` suffix**:
  ```properties
  yggdrasil-api-url=http://winnerproxy:2779/yggdrasil   # the suffix matters
  ```
- Look for `/yggdrasil/sessionserver/...` in WinnerProxy's log. None → URL is misconfigured.

---

### Log: `hrpauth hasJoined error, falling back to mojang`

**Symptom**: this line appears on every `hasJoined`.

**Meaning**: HRPAuth returned 5xx or a network error. WinnerProxy continues to Stage 2 (Mojang fallback), so **players may still get in**, but every request logs a WARN.

**Fix**:
- Check HRPAuth health.
- Network troubleshooting (HRPAuth port, routing).
- If persistent → raise `upstreams.hrpauth.timeout_sec`.

---

### Log: `generate password failed`

**Symptom**: rare; indicates `crypto/rand` failure.

**Cause**: kernel entropy exhausted (embedded / container without urandom).

**Fix**: change the host. `crypto/rand` failure is an OS-level problem, not a WinnerProxy concern.

---

### How do players bind Mojang to HRPAuth?

Since HRPAuth v0.2, the `mbe` (Mojang Bind Enabled) field controls the "collision bind" policy:

- `mbe = 0` (default, HA wins): an HRPAuth user without a bound Mojang UUID who is hit by a same-name Mojang player → HA `/register` (service-mode path) returns 409 `username_already_bound`; the Mojang player is kicked.
- `mbe = 1` (player opted in): same-name Mojang players are allowed to bind to that HRPAuth user; **only `mojang_uuid` + `last_sign_at` are written**. `password` / `email` / `cbh` are **preserved**.

#### Self-service (recommended)

After authorizing in HRPAuth WebUI, use a Bearer Token to call:
```http
POST /user/mojang-bind-enable
Authorization: Bearer <Access Token>
Content-Type: application/json
```

After success, the user's `mbe` is set to 1. **Idempotent**.

#### Operator-assisted

When the player cannot self-service, an operator uses a **Service Token** with `admin:user.write` scope:
```http
POST /user/mojang-bind-enable
Authorization: Bearer <Service Token>
Content-Type: application/json

{ "uid": "42" }
```

or:
```http
{ "email": "alice@example.com" }
```

> `uid` and `email` are mutually exclusive; missing both → HA returns 400.
> Note: setting `mbe=1` is **not reversible through the API**. To revert to `mbe=0`, you must currently update the database directly (HA has no disable endpoint yet).

---

### Other

#### "I want to test against a fake Mojang endpoint"

Disable real Mojang in `config.yml`:
```yaml
upstreams:
  official:
    enabled: false
```
Then run a local mock to simulate Mojang `hasJoined 200`.

#### "Can I run multiple WinnerProxy instances behind a load balancer?"

Yes, with caveats:
- `cache` is per-instance → cache hit rate drops
- HRPAuth Service Token is shared; all instances use the same `client_secret`
- No state synchronization needed; multiple instances converge on the same HRPAuth state

A single instance is enough for most workloads.

#### "How do I rotate the Service Token?"

1. Generate a new `oauth2.super_client_secret` in HRPAuth's `config.yaml`.
2. Update WinnerProxy's `config.yml` `upstreams.hrpauth.client_secret`.
3. `systemctl restart winnerproxy`.
4. During the restart, the old instance's auth fails and the new instance uses the new token. ~5–10s of unavailability is expected.
