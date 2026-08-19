---
title: WinnerProxy 部署指南
description: WinnerProxy 单实例部署、systemd 配置与联调验证
order: 5
updatedAt: 2026-08-15
---

# Deployment / 部署

> 中英双语。中文在前，英文在后。  
> Bilingual. Chinese first, English second.

---

## 中文

### 先决条件

- HRPAuth 已部署并可达
- 出站 HTTPS 到 `sessionserver.mojang.com` 和 `api.minecraftservices.com` 放行
- Linux 主机 + systemd（其他 init 自行写 unit）

### 单实例

WinnerProxy 是**单实例**设计：进程内 freecache、零共享状态、无 leader 选举。
需要 HA 时，把多个实例放在 TCP/HTTP 负载均衡后即可；link-token 验证由 HRPAuth 自己处理，
多实例之间不需要同步。

> 大多数场景下一台机器跑一个二进制 + systemd unit 就够。

### 部署

1. 复制 `winnerproxy` 二进制到任意目录（部署者自选）。
2. **首次启动**：进入该目录，运行 `./winnerproxy`：
   - 自动在**同目录**生成 `config.yml`（默认值，见 [Configuration](./configuration.md)）
   - 若 stdin 是 TTY 且未传 `--no-stdin`：提示输入 HRPAuth OAuth2 `client_secret`，回车后写入 `config.yml`
   - 若 stdin 非 TTY：跳过提示；需手动编辑 `config.yml` 填入 `upstreams.hrpauth.client_secret`
3. 编辑 `config.yml` 调整 `server.addr` / `upstreams.hrpauth.url` / `upstreams.hrpauth.client_secret` 等。
4. 把整个目录所有权交给服务用户，文件模式 `chmod 600 config.yml`。

### systemd unit（最小化、发行版无关）

```ini
# /etc/systemd/system/winnerproxy.service
[Unit]
Description=WinnerProxy
After=network.target

[Service]
Type=simple
# 部署者按需设置 User / Group / WorkingDirectory
# 唯一硬要求：可执行文件所在目录可读可执行，config.yml 同目录可读
ExecStart=/path/to/winnerproxy
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/path/to/winnerproxy-dir

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now winnerproxy
sudo systemctl status winnerproxy
```

> 上述 unit 是**模板**——`ExecStart` 路径 / `User` / `ReadWritePaths` 按实际部署目录替换。
> 不指定 `WorkingDirectory`：preStart 阶段用 `os.Executable()` 推导出同目录，**不依赖 CWD**。

### 与 HRPAuth 联调

启动后，按顺序跑这三条，全部应该成功：

```bash
# 1. WinnerProxy 自己
curl http://127.0.0.1:2779/health
# → {"status":"ok"}

# 2. HRPAuth 可达
curl http://hrpauth-host:2880/
# → 应返回 Yggdrasil meta

# 3. Mojang 出站可达
curl -sI https://sessionserver.mojang.com/session/minecraft/hasJoined?username=Notch
# → 204 / 200（Notch 不在线 204，正常）
```

### 验证清单

- [ ] `config.yml` 是 `chmod 600`，属主为服务用户
- [ ] `upstreams.hrpauth.client_secret` 与 HRPAuth `config.yaml > oauth2.super_client_secret` **完全一致**
- [ ] HRPAuth 可达（用上面第 2 条命令）
- [ ] Mojang 出站可达（用上面第 3 条命令）
- [ ] Minecraft 服务端 `server.properties`：
  - `online-mode=true`
  - `yggdrasil-api-url=http://winnerproxy:2779/yggdrasil`（**必须带 `/yggdrasil` 后缀**）
- [ ] `/health` 从监控点能返 200
- [ ] 启动日志没有 `WARN: hrpauth client_secret is empty`
- [ ] `config.yml` 已备份到密钥管理工具（**不提交到 git**）

### 资源占用

| 资源 | 占用 | 说明 |
|---|---|---|
| 内存 | 100 MiB + Go 堆 | `cache.size` 默认 100 MiB；Go 进程额外约 50–80 MiB |
| CPU | 几乎为零 | 单核足够支撑数百 QPS |
| 网络 | 出/入对称 | 入站 ~1 KiB/req（Minecraft 服务端）→ 出站到 HRPAuth ~2 KiB/req + Mojang ~10 KiB/req |
| 磁盘 | **0** | 无任何本地持久化数据 |

### 不要做的事

- ❌ **不要配反代**（nginx / Caddy 之类）。Yggdrasil 协议无状态、不加密，必要时让 Minecraft 服务端直连 WinnerProxy 即可。
- ❌ **不要把 `client_secret` 暴露到 Minecraft 服务端可达网络**。它等同高权限服务凭据。
- ❌ **不要让 WinnerProxy 直跑在公网**。Mojang 玩家会话劫持历史告诉我们：未鉴权暴露 = RCE 风险。WinnerProxy 应当只在 Minecraft 服务端与 HRPAuth 之间的内部网络可达。
- ❌ **不要以 root 跑**。开 `User=winnerproxy` 即可。
- ❌ **不要用 `yggdrasil-api-url=http://winnerproxy:2779/`**（漏 `/yggdrasil` 后缀会全部 404）。
- ❌ **不要热重载配置**。v0.2 不支持，改完 `config.yml` 必须 `systemctl restart winnerproxy`。

---

## English

### Prerequisites

- HRPAuth deployed and reachable
- Outbound HTTPS to `sessionserver.mojang.com` and `api.minecraftservices.com` allowed
- Linux host + systemd (other init systems: write your own unit)

### Single instance

WinnerProxy is a **single-instance** design: in-process freecache, no shared state, no leader
election. To scale out, put multiple instances behind a TCP/HTTP load balancer. Link-token
verification is handled by HRPAuth; WinnerProxy instances do not need to coordinate.

> For most operators, one binary on one host behind systemd is enough.

### Deployment

1. Copy the `winnerproxy` binary into any directory (operator's choice).
2. **First launch** — `cd` into that directory and run `./winnerproxy`:
   - A `config.yml` is auto-generated in the **same directory** (defaults — see [Configuration](./configuration.md))
   - If stdin is a TTY and `--no-stdin` is not set: a prompt asks for the HRPAuth OAuth2 `client_secret`, writes it back to `config.yml`
   - If stdin is not a TTY: the prompt is skipped; manually edit `config.yml` and fill in `upstreams.hrpauth.client_secret`
3. Edit `config.yml` to adjust `server.addr` / `upstreams.hrpauth.url` / `upstreams.hrpauth.client_secret`.
4. `chown` the directory to the service user, `chmod 600 config.yml`.

### systemd unit (minimal, distro-agnostic)

```ini
# /etc/systemd/system/winnerproxy.service
[Unit]
Description=WinnerProxy
After=network.target

[Service]
Type=simple
# Operator sets User / Group / WorkingDirectory as needed.
# Only hard requirement: the executable's directory is readable+executable,
# and config.yml in the same directory is readable.
ExecStart=/path/to/winnerproxy
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/path/to/winnerproxy-dir

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now winnerproxy
sudo systemctl status winnerproxy
```

> The unit above is a **template** — replace `ExecStart` / `User` / `ReadWritePaths` with
> the actual deployment paths. `WorkingDirectory` is intentionally unset: preStart derives the
> config directory from `os.Executable()`, so CWD does not matter.

### Bringing up against HRPAuth

After starting, run these three in order; all should succeed:

```bash
# 1. WinnerProxy itself
curl http://127.0.0.1:2779/health
# → {"status":"ok"}

# 2. HRPAuth reachable
curl http://hrpauth-host:2880/
# → Yggdrasil meta JSON

# 3. Mojang outbound reachable
curl -sI https://sessionserver.mojang.com/session/minecraft/hasJoined?username=Notch
# → 204 / 200 (204 is fine; Notch is offline)
```

### Production checklist

- [ ] `config.yml` is `chmod 600` and owned by the service user
- [ ] `upstreams.hrpauth.client_secret` matches HRPAuth's `config.yaml > oauth2.super_client_secret` **exactly**
- [ ] HRPAuth reachable (use the command above)
- [ ] Mojang outbound reachable (use the command above)
- [ ] Minecraft server's `server.properties`:
  - `online-mode=true`
  - `yggdrasil-api-url=http://winnerproxy:2779/yggdrasil` (the `/yggdrasil` suffix is **required**)
- [ ] `/health` returns 200 from your monitoring
- [ ] Startup log has no `WARN: hrpauth client_secret is empty`
- [ ] `config.yml` is backed up to your secrets manager (**never commit it**)

### Resource footprint

| Resource | Footprint | Notes |
|---|---|---|
| Memory | 100 MiB + Go heap | `cache.size` default 100 MiB; Go process adds ~50–80 MiB |
| CPU | near zero at rest | A single core handles hundreds of QPS |
| Network | symmetric | In ~1 KiB/req (from MC server) → Out to HRPAuth ~2 KiB/req + Mojang ~10 KiB/req |
| Disk | **0** | No on-disk state |

### What NOT to do

- ❌ **Do not front with a reverse proxy** (nginx / Caddy / etc.). The Yggdrasil protocol is stateless and unencrypted; the Minecraft server can talk to WinnerProxy directly.
- ❌ **Do not expose `client_secret` on any network the Minecraft server can reach.** It is equivalent to high-privilege service credentials.
- ❌ **Do not expose WinnerProxy to the public internet.** Mojang session-hijack history shows: unauthenticated public exposure → RCE risk. WinnerProxy should be reachable only on the internal network between the Minecraft server and HRPAuth.
- ❌ **Do not run as root.** Set `User=winnerproxy`.
- ❌ **Do not set `yggdrasil-api-url=http://winnerproxy:2779/`** (missing the `/yggdrasil` suffix → 404 everywhere).
- ❌ **Do not hot-reload config.** v0.2 has no SIGHUP. After editing `config.yml`, `systemctl restart winnerproxy`.
