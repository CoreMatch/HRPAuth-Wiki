---
title: Avalon 部署者文档
description: Avalon 的运行前提、两种形态的从零部署、配置项表、端口暴露、启停升级回滚、部署验证与故障对照。
order: 1
tags:
  - avalon
  - deployment
updatedAt: 2026-11-08
---

# Avalon — 部署

Avalon 是 Rusted Warfare 游戏服务端，Go 运行时主体 + 外置 Java 引擎壳（helper）。两种形态：

| 形态 | 条件 | 能力 |
|---|---|---|
| 独立分发包 | 带 `avalon-helper.jar` | 完整：握手、房间、命令、真实开局 |
| 无 helper | 不配置 `gameHelperPath` | 握手、房间/玩家管理、命令、Relay；开局返回 `game: no simulation backend available` |

当前部署清单（`deploy-manifest.yaml`）声明的是无 helper 形态：能启动、健康检查过、不能开局；接入 helper 后形态变更，清单必须同步更新。

## 运行前提

| 项 | 要求 |
|---|---|
| 操作系统 | Linux x86_64 / aarch64（静态链接 Go 二进制） |
| Java | 仅 helper 形态需要：JDK/JRE 17 的 `java` 在 `PATH` 中或在 `javaPath` 指定。过新的 JDK（如 25）会使 Avalon-Helper 的 Kotlin 2.0.0 编译器崩溃，用 Temurin 17 线 |
| 内存 | 建议 ≥1 GB（helper 默认 `-Xmx512m`，引擎常驻约 450 MB） |
| 数据库 / Redis | 无（文件存储） |
| helper jar | 来自 Avalon-Helper 仓，线协议版本必须与 Go 侧一致（当前 v4），不一致时 helper 反复重启、端口永不就绪 |
| Cascade | 仅后端形态需要（`cascadeEnable: true`） |
| 进程监督 | 编排形态归 Tinyvisor（`deploy-manifest.yaml` 声明 `manager: tinyvisor`） |

## 形态一：独立分发包（带 helper）

### 从零部署

```sh
tar xzf avalon-<version>-linux-<arch>.tar.gz
cd avalon-<version>-linux-<arch>
./start.sh            # 或直接 ./avalon
```

包内容：

```
avalon-<version>-linux-<arch>/
├── avalon                 # Go 服务端二进制
├── avalon-helper.jar      # Java 引擎壳（Go 侧按需自动拉起）
├── start.sh               # cd 到脚本目录并 exec ./avalon
└── data/
    ├── Config.json        # 核心配置
    ├── ConfigServer.json  # 房间配置
    └── gameData/          # 游戏数据（引擎必需，勿删）
```

首次启动会询问是否初始化 WEB 面板（任选其一），随后自动执行 `defStartCommand`（默认 `start`）：加载游戏内核 → 监听 `port`（默认 5123）。日志出现 `Start listening ...` 即就绪。

### 自行构建 helper（没有现成 jar 时）

在 Avalon-Helper 仓根目录：

```sh
./gradlew :Helper:jar -Dorg.gradle.java.home=/path/to/jdk-17
```

产物 `Helper/build/libs/avalon-helper.jar`。在 `data/Config.json` 接入：

```json
{
  "javaPath": "/path/to/jdk-17/bin/java",
  "gameHelperPath": "/path/to/avalon-helper.jar",
  "gameHelperArgs": [
    "-Davalonhelper.dataPath=/path/to/helper-data-root",
    "-Xmx512m"
  ]
}
```

- `gameHelperPath` 相对路径锚定数据根目录；绝对路径原样使用。
- `-Davalonhelper.dataPath` 是 helper 自己的数据目录（配置、回放、`data/gameData`）；缺省以 jar 同级目录为数据根。
- 接入成功标志：日志 `server.load.gameCore`。配置错误时日志 `external game core unavailable, falling back to no backend`，服务以无内核形态运行（开局报错）。

## 形态二：Cascade 后端（`cascadeEnable: true`）

启用后游戏端口改为 CASC 前导 + 会话门控，并另起 `/v1` 控制面。Go 侧配置（`data/Config.json`）：

```json
{
  "port": 5124,
  "cascadeEnable": true,
  "cascadeBackendId": "avalon-backend-a",
  "cascadeRoomCode": "GW01",
  "cascadeTrustMode": "pinned",
  "trustedCascadeIPs": ["203.0.113.7", "198.51.100.0/24"],
  "cascadePinnedFingerprints": ["<64 位十六进制>"],
  "cascadeTlsCert": "/run/secrets/backend.crt",
  "cascadeTlsKey": "/run/secrets/backend.key",
  "cascadeControlAddr": ":5125"
}
```

Cascade 侧 `config.yaml` 片段：

```yaml
default_backend_id: "avalon-backend-a"
backends:
  - id: "avalon-backend-a"            # 必须等于 Go 的 cascadeBackendId
    control_url: "https://127.0.0.1:5125"   # Go 未配证书时用 http://
    game_address: "127.0.0.1:5124"
    prefixes: ["GW"]                  # 房间码前缀路由
```

信任三档：

| 档位 | `cascadeTrustMode` | 行为 |
|---|---|---|
| 裸奔（默认） | `open`（或留空） | 接受任何来源；**游戏口严禁暴露公网** |
| IP 白名单 | `ip` | 只接受 `trustedCascadeIPs` 内来源；白名单为空启动报错 |
| 指纹固定 | `pinned` | IP 约束之上校验 TLS 客户端证书指纹（SHA-256 DER），不匹配即断开 |

大厅后端：加 `"cascadeLobby": true`——起引擎、建房、允许连入停留，但永不开局，拒绝客户端 `/start`；Cascade 侧把它配为 `default_backend_id`。模组房同样用大厅模式（启动只建房，玩家进入后才开局）。

配置非法（未知档位、坏 IP/CIDR、坏指纹、`ip` 档空白名单、`pinned` 档缺 TLS 或指纹）时启动直接失败，不静默降级。

## 配置项表

配置都是 JSON，位于数据根目录 `data/` 下，**启动时读取，改动一律重启生效（无热加载）**。首次启动自动生成默认值；缺失的键以默认值补齐并落盘。

### Config.json（核心）

| 键 | 默认 | 作用 |
|---|---|---|
| `port` | 5123 | 游戏端口（Cascade 组合形态让出 5123，用 5124） |
| `serverName` | "Avalon" | 服务器名 |
| `subtitle` | "" | 副标题，留空用地图名 |
| `log` | "WARN" | 日志级别 |
| `defStartCommand` | "start" | 启动后自动执行的控制台命令 |
| `autoUpList` | false | 启动后自动上报 RW 官方列表 |
| `uplistEnable` | true | 自报总开关；false 拦截 uplist/toup/tonp，与 cascadeEnable 无关 |
| `webPort` | 0 | WEB 面板端口，0 = 不开 |
| `webToken` | 随机 10 位 | WEB 鉴权令牌，首次生成后固定 |
| `webHOST` | "" | WEB 来源限制 |
| `mixProtocolEnable` / `rconMixEnable` / `webMixEnable` | false | 混合协议监听 |
| `javaPath` | "" | java 可执行文件，空 = `PATH` 里的 `java` |
| `gameHelperPath` | "" | helper jar 路径；**空 = 不装游戏内核**，文件缺失不挡启动（回落无内核并告警） |
| `gameHelperArgs` | [] | 追加 java 参数 |
| `cascadeEnable` | false | Cascade 网关模式（门控 + /v1 控制面） |
| `cascadeBackendId` | "avalon-backend" | 后端 ID（JWT aud、health 应答） |
| `cascadeRoomCode` | "" | 对 Cascade 暴露的房间码，空回落 `serverID` |
| `cascadeLobby` | false | 零模组大厅模式 |
| `cascadeTrustMode` | "open" | 对端信任档：open / ip / pinned |
| `trustedCascadeIPs` | [] | ip/pinned 档来源白名单（IP/CIDR），ip 档必填 |
| `cascadePinnedFingerprints` | [] | pinned 档客户端证书指纹，列表语义支持轮换并存 |
| `cascadeTlsCert` / `cascadeTlsKey` | "" | 服务端证书/私钥（PEM），游戏口与控制面共用；留空 = 明文 |
| `cascadeControlAddr` | ":5125" | /v1 控制面监听地址 |
| `cascadePendingTimeoutSec` | 0 | 会话 pending 绑定超时秒，0 = 5 |

### ConfigServer.json（房间）

| 键 | 默认 | 作用 |
|---|---|---|
| `serverID` | 随机 5 位 | 服务器 ID（房间码） |
| `passwd` | "" | 房间密码 |
| `maxPlayer` | 10 | 最大人数 |
| `oneAdmin` | true | 仅一名管理员（自动） |
| `enterAd` / `startAd` | "" | 进入/开局广播文案 |
| `startMinPlayerSize` | -1 | 手动开局最小人数，-1 禁用 |
| `autoStartMinPlayerSize` | 4 | 自动开局倒计时人数，-1 禁用 |
| `maxGameIngTime` | 7200 | 最大对局秒数，-1 禁用 |
| `maxOnlyAIGameIngTime` | 3600 | 全 AI 局最大秒数 |
| `enableAI` | false | 允许 AI 玩家 |
| `maxMessageLen` | 40 | 最大发言长度 |
| `maxUnit` | 200 | 最大单位数 |
| `isAfk` | true | AFK 检测 |
| `muteAll` | false | 全员禁言 |
| `turnStoneIntoGold` | false | 点石成金 |
| `saveRePlayFile` | true | 保存回放到 `data/replays/` |

`maxPlayer < startMinPlayerSize` 时自动纠偏（`startMinPlayerSize` 重置为 0 并告警），不挡启动。

### 其余文件

- `RelayConfig.json`：`mainID`（默认 "R"）、`upList`（默认 true）。
- `Plugins.json`：插件配置。空（无文件或空 entries）= 所有准入路径立即放行、零网络 I/O；非法（坏 JSON、重名、非法 URL、密钥短于 16 字节、未知否决事件）= 启动失败并指明条目与字段。插件机制与授权见开发者轨道的扩展点一节。
- `Settings.bin`：状态文件（语言、首启标记、UUID），非运维手改项。

## 端口与暴露面

| 端口 | 用途 | 暴露 |
|---|---|---|
| 游戏口（默认 5123；Cascade 组合形态 5124） | 游戏流量 | `open` 信任档严禁暴露公网；后端形态只需对 Cascade 可达 |
| 控制面（`cascadeControlAddr`，默认 :5125） | `/v1` 契约面 | 对 Cascade；信任档位同样作用于此 |
| `webPort`（默认 0 = 关） | HTTP 面板 / WebSocket 控制台 | 内网 |

## 启动 / 停止 / 升级 / 回滚

**启动**：

- 独立形态：`./start.sh` 或 `./avalon`。命令行参数：`-noPrint`（不打印交互输出）、`-Dkey=value`（覆盖配置项，前缀如 `avalonhelper.config.core.port=5123`，命令行优先于同名环境变量）、`-Davalonhelper.basePath=<数据根>`。
- 编排形态：进程归 Tinyvisor，部署经 HA-Cupbearer 触发（`POST /api/v1/deploy/run`），不要手搓进程。

**停止**：控制台 `exit` 或 SIGTERM。SIGTERM 是优雅退出：与控制台 `exit` 同一条链，送终 helper 耗时十几秒；**不要 SIGKILL**（退出路径含配置保存）。上一次没退完就起下一次会因残留进程占端口失败；紧急时第二次 SIGTERM 强退。

**升级**：

- 独立形态：停服 → 用新包覆盖 `avalon` 与 `avalon-helper.jar` → **保留整个 `data/`** → 重启。只升 Go 二进制或只升 helper jar 均可（两者经 stdin/stdout 线协议解耦），但线协议版本必须两侧一致。
- 编排形态：Cupbearer 部署新版本（`releases/<版本>` + `current` 软链原子切换 + 重启 + 健康探测）；`data/` 在共享数据目录，升级不触碰。

**回滚**：编排形态用 Cupbearer 回滚（`POST /api/v1/deploy/rollback`，`current` 切回上一版本目录并重启）。独立形态：保留旧包与 `data/`，手动换回。

## 验证

独立形态（带 helper）：

```sh
# 日志出现 Start listening 即游戏口就绪；控制台确认
./avalon
# 控制台输入 status / players
```

Cascade 后端形态：

```sh
# 控制面存活且房间在位（无 helper 形态的健康判据）
curl -s http://127.0.0.1:5125/v1/rooms
# 期望：200，rooms 数组含本服房间（含 backendId 字段）

# /v1/health 语义：有 helper 形态 = 游戏监听已建立且 helper 存活才 ready
curl -s http://127.0.0.1:5125/v1/health
# 无 helper 形态恒返回 503 BACKEND_NOT_READY——这是形态边界，不是故障
```

WEB 面板（`webPort` 开启时）：

```sh
curl -s -D- "http://127.0.0.1:<webPort>/HttpApi/api/AuthCookie?passwd=<webToken>"
# 期望：Set-Cookie: HttpApi-Authentication=...（24h 有效）
```

## 故障对照

只列实际遇到过的。

| 现象 | 原因 | 处理 |
|---|---|---|
| 游戏端口不就绪，日志循环刷 `helper speaks protocol N, Go side is M` | helper jar 与 Avalon 线协议版本不一致 | 对齐两侧版本（以 `docs/HELPER-PROTOCOL.md` 的 `ProtocolVersion` 为准）；实测 v4 jar 配 v3 Go 时 helper 无限重启 |
| 服务起来了，`/start` 回 "This command needs the game engine..." | `gameHelperPath`/`javaPath` 未配或文件缺失，回落无内核（不挡启动） | 补齐配置重启 |
| 启动直接失败，错误以 `plugin:` 开头 | `Plugins.json` 非法 | 按错误指明的条目/字段修正；不存在静默降级 |
| 启动直接失败，提示信任/证书相关 | `cascadeTrustMode` 与配套项不齐 | ip 档补白名单；pinned 档补证书与指纹 |
| `plugin list` 的 `failOpen` 持续上涨 | 插件不可达/太慢/应答畸形 | 准入已自动放行，主流程不受影响；修复插件后计数停止 |
| 启动时 ERROR `...der.kim... no such host` | 上游国家探测域名已死 | 无需处理，自动回落 EN 语言，每次启动都会出现 |
| 开局失败，日志 `map content mismatch` | 盘上地图文件与登记时不一致（被改过） | `map` 命令重新登记或恢复文件 |
| 开局失败，`map file missing` | 登记后文件被删/未落盘 | 重新登记 |
| helper 重启后玩家掉线、房间重置 | 日志 `helper generation N exited`：世代更替，旧连接作废 | 客户端重连；频繁出现查 helper 崩溃原因（内存/引擎异常） |
| 子服房间已可见，客户端被 "No available backend" 踢回 | Cascade 健康判定要连续两次探测成功，房间快照一次即可见，存在窗口期 | 门控等后端健康（`/api/backends` 全 healthy），不要只等房间出现 |
| 重启时端口被占 | 上一次 SIGTERM 未退完（送终 helper 十几秒） | 等退出完成再起；紧急时第二次 SIGTERM 强退 |

日志：`data/logs/`；回放：`data/replays/`；插件投递队列（deliver 档 WAL）：`data/plugins/outbox/`。
