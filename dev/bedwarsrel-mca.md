---
title: BedwarsRel-MCA 开发者文档
description: BedwarsRel-MCA 的 fork 边界、模块结构、上报管线（事件挂钩、幂等键、投递与死信）、数据形态与构建约束。
order: 2
tags:
  - bedwarsrel
  - development
updatedAt: 2026-11-08
---

# BedwarsRel-MCA — 开发

## fork 边界

- 玩法 100% 上游（BedwarsRel/BedwarsRel，fork 直接坐在上游 master 头顶）；本地提交只有两组：**对局结果上报**与**构建/依赖/版本支持现代化**（仓内 knowledge 0001）。
- 版本支持收窄到 1.8.x 与 1.12：NMS 模块只有 `v1_8_r1/r2/r3` 与 `v1_12_r1`，1.8 模块与上游逐字节一致（knowledge 0003）。
- 上报管线整体在 `common/src/main/java/io/github/bedwarsrel/mca/` 包内，与玩法代码解耦：网络 IO 永不碰主线程与活动游戏状态，上报任何失败都不向游戏流程抛异常。

## 模块结构

```
common/        玩法主体 + mca 上报包 + 全部测试（无 NMS 依赖）
v1_8_r1/r2/r3  1.8 / 1.8.3 / 1.8.8 NMS 适配
v1_12_r1       1.12 NMS 适配
plugin/        shade 打包模块：产物 BedwarsRel-<version>[-SNAPSHOT].jar
build/         get-dependencies.sh（把自备 CraftBukkit jar 装入本地 Maven 仓）
```

构建约束：NMS 模块依赖 `org.spigotmc:minecraft-server:1.8-SNAPSHOT`（公网 Maven 仓已不存在）与未入库的 CraftBukkit jar，**CI（GitHub Actions）只构建并测试 `common`**；整仓构建必须自备 jar（README "Building" 一节）。

## 上报管线（`io.github.bedwarsrel.mca`）

### 事件挂钩点

`common/src/main/java/io/github/bedwarsrel/game/GameCycle.java::runGameOver`：`BedwarsGameOverEvent` 触发且未被取消后调用 `MatchReportService.reportGameEnd`。快照（`MatchSummaryBuilder.java::fromGame`）在**服务端主线程、任何清理之前**同步构建，随后入队——区域名作图名、起止时刻（秒截断）、时长、每队 `team_id`/`initial_count`/`alive_count`/胜负、每参与者 UUID/名字/生存时长/击杀/死亡。成员按 UUID 排序、队伍胜者在前再按 team_id 排序，保证派生物确定性。生命周期接线在 `BedwarsRel.java::onEnable`（init）/`onDisable`（shutdown）。

### 幂等键

`GameIdGenerator.java::generate`：对开始时刻、地图、对战类型与全部队伍/成员 UUID 做 name-based UUID——**易变统计不进键**。成功上报的 game_id 持久化进有界 ledger（`ReportLedger`，插件数据目录 `mca-reported-matches.log`，容量 `ledger-capacity`）：已入账的对局永不再报，跨重启有效。同一 game_id 也随载荷发出，服务端侧再做一层去重（同载荷重放 200，异载荷 409）。

### 投递与失败分类

单守护线程 worker 排空有界队列（`retry.queue-capacity`，溢出丢弃并告警），POST HA-Contract v1.4.0 统一形状载荷（`MatchReportPayload.java::toJson`）：`match_type`、`teams`（每队 `result` win/lose/draw）、`duration_seconds`（与时间戳同源秒值，防 400 不一致拒绝）、`map_name`、`game_id`、`source: "game"`、RFC 3339 UTC 时间戳。

`ReportClassifier.java::classifyStatus`：

- **2xx** → 记 ledger（200 = 服务端对同 game_id 的幂等重放）；
- **4xx** → 连同响应体记日志，**永不重试**（类型化拒绝，重试无意义）；
- **5xx / 网络失败** → 指数退避重试（基础 `retry.delay-millis`，按次翻倍，封顶 30s）至 `retry.max-attempts`，耗尽后写死信。

### 死信与重放

`DeadLetterStore`（插件数据目录 `mca-dead-letter.log`，有界 `dead-letter-capacity`）：每条含时间戳、game_id、失败原因与完整载荷。管理命令 `/mca`（`McaCommand.java::handle`，亦走 `/bw mca`，权限 `bw.mca`）：

- `/mca deadletter`——未投递条数；
- `/mca replay [n]`——最近 n 条重新入队（默认 10、上限 50），队列满即停，畸形条目丢弃；已处理的从存储移除。重放失败耗尽重试后回写死信；重放成功不会重复结算（同 game_id 服务端归并）。

### 凭据（`TokenProvider`）

- 形态 A：静态服务令牌（`credentials.service-token`，或旧键 `access-token`；占位符 `your-access-token-here` 视为未配置）；
- 形态 B：client_credentials 换取的 access token，缓存至临近过期，401 后重取；
- 两者都配时 A 胜出；端点或凭据缺失则禁用上报并告警。

### 已知边界

- `perf_tweak` 硬编码 `1.0`（与评分模型的关系未验证）；
- 无获胜者的局按全平局上报（每队 `result: "draw"`，服务端 S=0.5 结算）；
- 中途退出玩家的击杀/死亡按 0 上报（其统计在离开时已合并重置）；
- 参与者身份用 `player.getUniqueId()`，离线模式 UUID 的影响在仓内 PENDING-DECISIONS 挂账。

## 数据源锚点

- `common/src/main/java/io/github/bedwarsrel/game/Game.java::startedAt`、`playerSurvivalTimes`、`getParticipants`；
- `common/src/main/java/io/github/bedwarsrel/statistics/PlayerStatistic.java::getCurrentKills`。

## 测试

`common/src/test/java/io/github/bedwarsrel/mca/`：摘要映射、幂等键稳定性、载荷形状、失败分类、重试行为、ledger 持久化、凭据降级、死信重放。运行：`mvn -pl common test`。
