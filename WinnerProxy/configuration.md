---
title: WinnerProxy 配置说明
description: WinnerProxy config.yml 详细字段说明与部署建议
order: 4
updatedAt: 2026-08-15
---

# Configuration / 配置

> 中英双语。中文在前，英文在后。  
> Bilingual. Chinese first, English second.

---

## 中文

`config.yml` 位于可执行文件同目录。**首次启动自动生成**默认值；缺字段自动回退到默认值。  
schema version = `2`（v0.2+）。

### 完整 schema

```yaml
# HTTP 监听
server:
  addr: ":2779"
  read_timeout_sec: 15
  write_timeout_sec: 15

# 进程内 profile 缓存（freecache；仅内部使用，无 HTTP 端点）
cache:
  size: 104857600        # 100 MiB
  ttl_sec: 300           # 5 分钟

# 日志
log:
  level: info            # debug | info | warn | error
  format: text           # text | json

# 鉴权上游
upstreams:
  # Mojang 官方（sessionserver.mojang.com + api.minecraftservices.com）
  official:
    enabled: true
    timeout_sec: 10

  # HRPAuth（Yggdrasil 公开端点 + /register 代注册）
  hrpauth:
    url: "http://127.0.0.1:2880"
    client_id: "hrpauth-internal-super"
    client_secret: "<复制自 HRPAuth config.yaml > oauth2.super_client_secret>"
    timeout_sec: 10
    enabled: true

# 站点元信息（仅在启动日志中展示）
site:
  name: WinnerProxy
  version: 0.2.0

# Schema 版本号，不要改
version: "2"
```

### 字段参考

#### `server`

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `addr` | string | `:2779` | TCP 监听地址。`:2779` 表示所有网卡；`127.0.0.1:2779` 表示仅本地。 |
| `read_timeout_sec` | int | 15 | 读取整个请求（含 body）的最大时长。0 = 不超时。 |
| `write_timeout_sec` | int | 15 | 写入响应的最大时长。0 = 不超时。 |

#### `cache`

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `size` | int | 104857600 | freecache 容量（字节）。freecache 最小 512 KiB，更小值会被静默上调。`0` 关闭缓存（用 Noop 实现）。 |
| `ttl_sec` | int | 300 | 缓存条目存活秒数。负值或 0 视为 5 分钟。 |

#### `log`

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `level` | string | `info` | `debug` / `info` / `warn` / `error` 之一。 |
| `format` | string | `text` | `text` 人类可读；`json` 结构化。 |

#### `upstreams.official` (Mojang)

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `enabled` | bool | `true` | 是否启用 Mojang 兜底。设为 `false` 后所有 Mojang 玩家都无法进服。 |
| `timeout_sec` | int | 10 | Mojang HTTP 调用超时。 |

Mojang base URL 是硬编码的，只可调超时。

#### `upstreams.hrpauth` (HRPAuth)

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `url` | string | `""` | HRPAuth base URL，如 `http://127.0.0.1:2880`。`enabled: true` 时 **必填**。 |
| `client_id` | string | `hrpauth-internal-super` | HRPAuth OAuth2 服务客户端 ID。默认使用内置超级客户端。 |
| `client_secret` | string | `""` | HRPAuth OAuth2 服务客户端密钥。`enabled: true` 时 **必填**。复制自 HRPAuth `config.yaml > oauth2.super_client_secret`。 |
| `timeout_sec` | int | 10 | HRPAuth HTTP 调用超时。 |
| `enabled` | bool | `true` | 设为 `false` 后 WinnerProxy 无法做协议翻译，**几乎等于失效**。 |

> **安全提示**：`client_secret` 是高权限服务凭据，等同旧时代的 super-admin token。`chmod 600 config.yml`，**永远不要提交到 git**。

#### `site`

仅在启动日志中展示，无运行时效果。

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | 人类可读名，如 `WinnerProxy`。 |
| `version` | string | 构建版本号，如 `0.2.0`。 |

#### `version`

配置文件 schema 版本号。**不要手动改**。保留以备未来配置迁移。

### 启动行为

- **首次启动**（`config.yml` 不存在）：
  1. 写入默认 `config.yml` 到可执行文件同目录
  2. 如果 stdin 是 TTY 且未传 `--no-stdin` → 提示输入 HRPAuth OAuth2 `client_secret`，写入文件
  3. 启动服务
- **非首次启动** → 直接读 `config.yml` 启动
- **client_secret 仍为空** → 启动时打 WARN（不会 fatal），但所有 `/register` 调用都会失败

### 配置示例：最小本地

```yaml
server:
  addr: ":2779"

upstreams:
  official:
    enabled: true
  hrpauth:
    url: "http://127.0.0.1:2880"
    client_secret: "abcdef0123456789..."
    enabled: true
```

### 配置示例：反向代理后端

```yaml
server:
  addr: "127.0.0.1:2779"     # 仅本地监听；nginx 转发

upstreams:
  official:
    enabled: true
    timeout_sec: 15
  hrpauth:
    url: "http://127.0.0.1:2880"
    client_secret: "<oauth2.super_client_secret>"
    timeout_sec: 15
    enabled: true
```

### 已移除字段（v0.1 → v0.2）

以下字段 v0.2+ 不再支持：

- `upstreams.yggdrasilapi.*` —— 通用 Yggdrasil 上游已删除，HRPAuth 是唯一 Yggdrasil 实现
- `proxy.callback_url`, `proxy.timeout_sec` —— 改为 `upstreams.hrpauth`
- `mapping.*` —— WinnerProxy 不再维护本地玩家映射表
- `cache.gc_interval_sec` —— freecache 内部固定 30s 触发 GC，不需要配置

老 `config.yml` 中残留这些字段会被静默忽略。

---

## English

`config.yml` lives next to the executable. **A default file is auto-generated on first launch**; missing fields fall back to defaults. Schema version = `2` (v0.2+).

### Full schema

```yaml
# HTTP listener
server:
  addr: ":2779"
  read_timeout_sec: 15
  write_timeout_sec: 15

# In-process profile cache (freecache; internal-only, no HTTP endpoints)
cache:
  size: 104857600        # 100 MiB
  ttl_sec: 300           # 5 minutes

# Logging
log:
  level: info            # debug | info | warn | error
  format: text           # text | json

# Auth upstreams
upstreams:
  # Mojang official (sessionserver.mojang.com + api.minecraftservices.com)
  official:
    enabled: true
    timeout_sec: 10

  # HRPAuth (Yggdrasil public endpoints + /register proxy registration)
  hrpauth:
    url: "http://127.0.0.1:2880"
    client_secret: "<copy from HRPAuth config.yaml > oauth2.super_client_secret>"
    timeout_sec: 10
    enabled: true

# Site metadata (logged at startup)
site:
  name: WinnerProxy
  version: 0.2.0

# Schema version, do not edit
version: "2"
```

### Field reference

#### `server`

| Field | Type | Default | Description |
|---|---|---|---|
| `addr` | string | `:2779` | TCP listen address. `:2779` = all interfaces; `127.0.0.1:2779` = localhost only. |
| `read_timeout_sec` | int | 15 | Max duration for reading the entire request (body included). 0 = no timeout. |
| `write_timeout_sec` | int | 15 | Max duration for writing the response. 0 = no timeout. |

#### `cache`

| Field | Type | Default | Description |
|---|---|---|---|
| `size` | int | 104857600 | freecache capacity in bytes. freecache enforces a 512 KiB minimum; smaller values are silently rounded up. `0` disables the cache (a Noop is used). |
| `ttl_sec` | int | 300 | How long a cache entry lives. 0 or negative = 5 minutes. |

#### `log`

| Field | Type | Default | Description |
|---|---|---|---|
| `level` | string | `info` | One of `debug`, `info`, `warn`, `error`. |
| `format` | string | `text` | `text` for human-readable; `json` for structured logs. |

#### `upstreams.official` (Mojang)

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | bool | `true` | Whether to use Mojang as the fallback. Setting to `false` means no Mojang player can ever join. |
| `timeout_sec` | int | 10 | HTTP timeout for Mojang calls. |

Mojang's base URL is hardcoded; only the timeout is configurable.

#### `upstreams.hrpauth` (HRPAuth)

| Field | Type | Default | Description |
|---|---|---|---|
| `url` | string | `""` | HRPAuth base URL, e.g. `http://127.0.0.1:2880`. **Required** when `enabled: true`. |
| `client_secret` | string | `""` | HRPAuth OAuth2 service client secret. **Required** when `enabled: true`. Copy from HRPAuth `config.yaml > oauth2.super_client_secret`. |
| `timeout_sec` | int | 10 | HTTP timeout for HRPAuth calls. |
| `enabled` | bool | `true` | Setting to `false` makes WinnerProxy unable to translate sessions — effectively dead. |

> **Security note**: `client_secret` is a high-privilege service credential; treat it like a database root password. `chmod 600 config.yml`, **never commit it to git**.

#### `site`

Non-runtime metadata, logged at startup.

| Field | Type | Description |
|---|---|---|
| `name` | string | Human-readable name, e.g. `WinnerProxy`. |
| `version` | string | Build version, e.g. `0.2.0`. |

#### `version`

Schema version of this config file. **Do not edit manually**; reserved for future migrations.

### Startup behavior

- **First launch** (`config.yml` does not exist):
  1. A default `config.yml` is written next to the executable
  2. If stdin is a TTY and `--no-stdin` is not set → the user is prompted for the HRPAuth OAuth2 `client_secret` (which is patched into the file)
  3. The service starts
- **Subsequent launches** → read `config.yml` and start
- **client_secret still empty** → a WARN is logged at startup (not fatal), but every `/register` call will fail

### Minimal local example

```yaml
server:
  addr: ":2779"

upstreams:
  official:
    enabled: true
  hrpauth:
    url: "http://127.0.0.1:2880"
    client_secret: "abcdef0123456789..."
    enabled: true
```

### Production behind a reverse proxy

```yaml
server:
  addr: "127.0.0.1:2779"     # localhost only; nginx fronts it

upstreams:
  official:
    enabled: true
    timeout_sec: 15
  hrpauth:
    url: "http://127.0.0.1:2880"
    client_secret: "<oauth2.super_client_secret>"
    timeout_sec: 15
    enabled: true
```

### Removed fields (v0.1 → v0.2)

The following fields are **no longer supported**:

- `upstreams.yggdrasilapi.*` — generic Yggdrasil upstream removed; HRPAuth is the only Yggdrasil implementation
- `proxy.callback_url`, `proxy.timeout_sec` — replaced by `upstreams.hrpauth`
- `mapping.*` — WinnerProxy no longer maintains a local player mapping table
- `cache.gc_interval_sec` — freecache runs its own GC at a fixed 30s interval; not configurable

Old `config.yml` files carrying these fields have them silently ignored.
