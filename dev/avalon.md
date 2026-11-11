---
title: Avalon 开发者文档
description: Avalon 的代码结构、构建与测试、扩展点与契约（插件、helper 线协议、控制面）、数据形态与协议兼容规则。
order: 2
tags:
  - avalon
  - development
updatedAt: 2026-11-08
---

# Avalon — 开发

## 代码结构

```
cmd/avalon/            程序入口
internal/
  app/                启动链（对应原版 Main/Initialization/Application）+ 全局事件
  command/            控制台与客户端命令（含 ex/Vote、relay/）
  core/               线程池、定时任务标识、服务装载
  data/               全局数据、配置 bean、管理数据（封禁/管理员）
  game/               游戏层：事件总线、房间、玩家、管理、外部内核接缝(external)
  io/                 字节流与包（含 GameCommandOnePacket 解析）
  net/                网络层：协议实现（gameserver/Relay）、HTTP、服务、解码
  plugin/             进程外插件系统（hub、事件目录、配置校验）
  resource/           内嵌语言包与静态资源
  struct/             容器（Seq/Map）
  timetask/           定时任务（Quartz 语义的 Go 重写）
  util/               工具（日志、加解密、文件、压缩、i18n 等）
```

## 构建与测试

需要 Go 1.26.10+（`go.mod`）。

```bash
go build -o avalon ./cmd/avalon     # 产物 ./avalon
go build ./...
go vet ./...
go test ./...                       # 提交前必须全绿，需要时追加 -race
```

涉及真实引擎的测试（缺条件时自动跳过）：

- `AVALON_HELPER_REPO_ROOT`：指向 Avalon-Helper 检出（含 `data/gameData`）；jar 未构建或缺数据时测试跳过。
- `AVALON_HELPER_TEST_JAVA`：指定 JDK 17 的 java。
- 分发自治性：`internal/app/dist_e2e_test.go::TestDistributionSelfContained`——干净目录组装 → 启动 → 真客户端 TCP 握手（160→161）→ addai×2 + start → 真实对局 → gameover 结算 → 回放落盘 → 优雅退出。
- Cascade 联调：`go test ./internal/net/gateway/ -run TestCascadeRealProxyE2E`（需本机 Cascade 源码，`AVALON_CASCADE_SRC` 指定）。
- 插件模板保活：`internal/plugin/template_e2e_test.go::TestTemplatePluginRunsAgainstHub`——把 `docs/plugins/template/` 编译成二进制起真进程接真 hub（协商/放行/否决/投递/密钥错配）。

## 扩展点与契约

### 进程外插件（三档）

插件是独立进程的 HTTP 服务端，Avalon 作为客户端调用，方向严格单向；引擎 JVM 不加载任何第三方代码。

- 三档：`observe`（尽力送达，不持久不重试）/ `veto`（同步可否决，超时故障一律 fail-open）/ `deliver`（WAL 至少一次，按 `eventId` 去重）。
- 配置：`data/Plugins.json`；空 = 零回归；非法 = 启动失败（`internal/plugin/config.go::validate`）。
- 否决双闸门：manifest 声明 `veto: true` 且 `vetoEvents` 授权，默认拒绝；判定在 `internal/plugin/hub.go::vetoConsulted`；理由净化 `internal/plugin/hub.go::sanitizeReason`。
- 事件全集：`internal/plugin/eventv2.go::allEventNames`；机器可读目录在 `docs/plugins/EVENT-CATALOG.md` 的 `plugin-events` 区块，由 CI 与代码、HA-Contract 三方同步校验。
- 契约权威：HA-Contract `docs/api/openapi/avalon-plugin-v1.yaml`；开发者文档与 Go 模板在 `docs/plugins/`。

### helper 线协议

- 合同：`docs/HELPER-PROTOCOL.md`；实现权威 `internal/game/external/protocol.go`。
- `internal/game/external/protocol.go::ProtocolVersion` 当前为 4；握手版本不一致直接失败（`ErrProtocol`），不静默降级。
- v2 线格式之上五个 v2-ext 扩展操作：`room.addai` / `room.sync` / `room.removeplayer` / `game.result` / `room.settings`；只实现 v2 的 helper 回 `unsupported`，Go 侧降级为空操作（不 panic、不断连）。
- helper 生命周期由 Go 托管：崩溃自动重启（世代号递增，旧连接作废）；退出时先 `stop`、关 stdin、再回收；helper 输出走 stderr（stdout 是协议通道），Go 侧保留尾部 8KB。

### Cascade 控制面（Cascade-Backend-v1）

- 路由注册：`internal/net/gateway/control.go`；房间投影 `internal/net/gateway/rooms.go::RoomSummary`。
- 模组清单：`internal/net/gateway/mods.go::handleRoomMods` / `::handleRoomModFile`（`GET /v1/rooms/{code}/mods[/{file}]`），清单生成 `internal/game/manage/modmanifest.go`（枚举 `data/mods`，SHA-256 + 大小）。
- 地图清单与校验：`internal/game/manage/mapmanifest.go::BuildMapManifest`；开局前盘上复核 `internal/game/gamemaps.go::MapData.VerifyOnDisk`（`ErrMapSourceUnavailable` / `ErrMapContentMismatch`）；协议 v4 的 `room.start` 对非默认地图强制 `mapSha256`/`mapSize`。
- 会话门控（D-18）：绑定前只放行 Preregister(160)，BOUND 前到达的 RegisterPlayer(110) 及后续包一律断开。

### 其他接缝

- 开局汇聚点：`internal/game/seam.go::StartGame`（大厅分支直接返回；插件 `game.start` 否决挂这里）。
- 踢出单一咽喉点：`internal/game/player/player.go::KickPlayer`（`player.kicked` 审计事件挂这里）。
- 客户端命令：`internal/command/clientcommands.go::RegisterClientCommands`；服务端命令：`internal/command/servercommands.go`。

## 数据形态

- 数据根目录默认 = 可执行文件所在目录；`-Davalonhelper.basePath=<路径>` 或环境变量 `avalonhelper.basePath` 覆盖。编排形态由 Cupbearer 经启动脚本注入共享数据目录（`deploy-manifest.yaml` 的 `baremetal.install.shared_data`），版本升级不重置配置/地图/模组。
- `data/` 内容：`Config.json`、`ConfigServer.json`、`RelayConfig.json`、`Plugins.json`、`Settings.bin`、`CascadeJti.bin`（jti 一次性消费持久化）、`logs/`、`replays/`、`plugins/outbox/`（deliver 档 WAL）、`maps/`（自定义地图登记源）、`mods/`（房间模组集权威来源）、`gameData/`（引擎必需）。
- 配置为 JSON、无版本字段；缺失键首启补默认值并落盘。

## 协议版本兼容规则

| 协议 | 当前 | 规则 |
|---|---|---|
| helper 线协议 | `ProtocolVersion = 4` | 两侧必须同版；不一致 = 显式失败、helper 反复重启，无降级 |
| v2-ext 扩展操作 | 5 个 | 旧 helper 回 `unsupported`，Go 侧空操作降级，线格式与版本号不变 |
| 客户端协议 | 目标客户端 1.15 / 协议号 176 | 注册 checksum 只覆盖基础单位；自定义单位清单由客户端侧核对 |
