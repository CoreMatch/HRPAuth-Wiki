---
title: MatchCoreArena-Server 开发者文档
description: MCA-Server 的代码结构、构建与测试、匹配队列与成局流程、加权 Elo 评分模型、对局上报契约、数据形态与迁移。
order: 2
tags:
  - matchcorearena
  - development
updatedAt: 2026-11-08
---

# MatchCoreArena-Server — 开发

## 代码结构

```
main.go                  入口：配置加载 → 数据库迁移 → MySQL/Redis/HRPAuth 初始化
                         → tokens 加载 → 路由注册 → 匹配引擎 → HTTP 监听
api/
  router.go              路由装配与端点鉴权分级
  handler/               HTTP handler：auth / user / friend / team / match /
                         matchmaking / ranking / maintenance / metrics
  middleware/            auth（Bearer 校验）、recovery、request_id
config/                  配置加载、版本迁移链（1.0.0→1.9.0）、严格校验
internal/
  apperr/                业务错误码与 HTTP 状态映射
  auth/                  HRPAuth 客户端、令牌校验器、tokens.yaml 存储
  metrics/               计数器注册表（内存快照）
  rating/                加权 Elo 评分模型（纯函数，无外部依赖）
  reportlog/             拒绝/冲突记录的有界内存环
  response/              HA-Contract 统一响应信封
  service/               业务层：match（结算）、matchmaking（队列+引擎）、
                         user / friend / team / ranking / maintenance /
                         uuid_resolve
migrate/                 版本化 schema 迁移（v1 冻结 baseline + v2 增量）
redis/                   Redis 客户端初始化
test/e2e/                端到端测试
```

## 构建与测试

```bash
go build ./...
go vet ./...
go test ./...        # CI（.github/workflows/go.yml）同此三步
```

数据库层测试全部用 go-sqlmock（纯 Go），不需要真实 MySQL/Redis，无 CGO。`test/e2e/` 下另有端到端测试。

## 匹配队列与成局流程

### 入队

`internal/service/matchmaking.go::Join`：

- 单人入队：不在任何队伍中才可单独排队；写入 `matchmaking_queue`（`uk_user` 唯一键保证每人同时至多一条排队记录），评分取当前 `users.rank_score` 快照。
- 队伍入队（`party_members` 非空）：成员 UUID 经 HRPAuth 服务凭据解析为 uid → 建临时队伍（`matchmaking_parties` + `matchmaking_party_members`）→ 全队写入队列共享同一 `party_id`。人数须在 [2, 模式单队上限] 内；成员不得已在其他队伍或队列中。

### 引擎成局

后台引擎 `internal/service/matchmaking.go::MatchmakingEngine`，`matchmaking.enabled` 时由 `main.go` 启动：

1. **Tick 周期**（`tick_seconds`）：先删除超时条目（`enqueued_at` 距今 ≥ `queue_timeout_seconds`，数据库侧 `TIMESTAMPDIFF` 计算，避免驱动时区偏差），再逐模式成局。进程启动后立即先跑一轮（重启后及时清理超时）。
2. **分差窗口**：`ratingWindow = base_rating_window + 已等待分钟数 × rating_window_growth_per_minute`，封顶 `max_rating_window`。
3. **贪心装箱**（`formGroups`）：以等待最久的单位为轴（其次评分更高），窗口取其等待时长对应的分差窗口；窗口内的候选按等待优先装入各队——匹配单位是单人或整队（party 成员平均分，必定同局同队），单位不可拆分；装满模式所需全部队伍即成局，装不满则等待窗口放宽或新人入队。一局成交后循环继续，直到队列凑不满。
4. **成局提交**（`commitGroup`）：单事务写 `matchmaking_groups` + `matchmaking_group_members`（队伍标识按装入顺序分配 `A`/`B`/…）→ 按 id 删除队列行并校验影响行数（行数不符 = 另一实例已抢先，放弃本次成局）→ 清理已成交的临时队伍。
5. **客户端获取成局**：轮询 `GET /api/matchmaking/status`，`recent_groups` 含本人相关成局；成局记录携带 `join_target`（配置了 `matchmaking.join_target.host` 时下发游戏服地址，否则省略整个字段，客户端回落本地配置）。

队列存于 MySQL，进程重启天然恢复；多实例并发由成局事务的影响行数守卫兜底。

## 评分模型（加权 Elo）

**积分只由服务端写入**：上报方只提交对局事实（胜负、生存、KDA），不提交任何分数；结算在 `internal/service/match.go::Report` 的事务内完成，写分语句 `UPDATE users SET rank_score = GREATEST(0, rank_score + Δ)`（积分下限 0）。

核心公式（`internal/rating/rating.go::CalculateDelta`）：

```text
Δ = K × (S − E) × W_round × W_streak × W_perf
```

### E：期望胜率

`CalculateEloExpected`：

```text
E = 1 / (1 + 10^((R_对方 − R_本方) / 400))
```

以**队伍平均分**代入：有获胜队时，胜队平均分对败方全员平均分求期望（胜方 S=1、败方 S=0）；全平局时每队以本队平均分对对方全员平均分求期望（S=0.5）。

### K：基础权重（`GetKFactor`）

按已获胜场次 `wins_count` 分两阶段：

| 阶段 | 条件 | K |
|---|---|---|
| 定级期 | 胜场 < 10 | 从 520 线性递减到 390：第 n 场胜利（n=1..10）取 `520 − (n−1)×(520−390)/9` |
| 稳定期 | 胜场 ≥ 10 | 取 (165 + 215) / 2 = 190 |

### W_round：回合生存权重（`GetSurvivalWeight`）

获胜队最终存活人数 / 初始人数：

| 生存比例 | W_round | 语义 |
|---|---|---|
| ≤ 0.25 | 1.00 | 惨胜 |
| ≤ 0.5 | 1.05 | |
| ≤ 0.75 | 1.15 | |
| > 0.75 | 1.25 | 完胜 |

有获胜队时，胜队生存权重作用于**全部**参与者；全平局时每队取本队自身生存权重。

### W_streak：连胜/连败权重（`GetStreakWeight`）

连胜/连败数在结算时更新（胜：正计数 +1 或从负翻为 1；败：负计数 −1 或从正翻为 −1；平局清零）：

| 连续场次 | 连胜 | 连败 |
|---|---|---|
| ≤ 2 | 1.00 | 1.00 |
| 3–4 | 1.15 | 0.85 |
| ≥ 5 | 1.28 | 0.73 |

### W_perf：个人表现微调（`GetIndividualPerformanceTweak`）

上报字段 `perf_tweak`，钳制到 [0.95, 1.05]；上报方未提供（0）按中性 1.0 处理，不落入下限形成隐性惩罚。全平局不计此因子（恒 1.0）。

### 队伍（party）共享结算

上报携带 `matchmaking_group_id > 0` 时，经 `applyPartySharing`：同一 party 的成员共享组内平均后的积分变动（组队排队的公平性保证）。

### 结算流程（`Report`）

1. 载荷规范化与校验（`normalizeTeams`：`teams` 或 `winner_team`+`loser_teams` 两种等价形状；`validateTeams`：≥2 队、result 合法、成员不跨队重复等）；
2. 时间解析（RFC3339 或 `YYYY-MM-DD HH:MM:SS` UTC）；`duration_seconds` 提供时必须与起止差一致；
3. `game_id` 幂等预检（见下节）；
4. 事务内：参与者 UUID→uid 解析（懒建 users 行）→ 写 `matches` 主表 → 各队平均分 → 逐人计算 Δ（先算后写）→ party 共享 → `UPDATE users` + 写 `match_participants` 明细 + 更新排行榜。

## 对局上报接口契约

唯一入口 `POST /api/matches`（`api/handler/match.go::Report`）：

- **鉴权**：OPS 级凭据（`auth.maintenance_token` 或 `tokens.yaml` 服务令牌）且持 `match:report` scope；玩家令牌一律 403。
- **身份信任边界**：参与者 uid 只来自 HRPAuth 服务间接点（`GET /services/users/{uuid}`）的解析结果，上报方的任何 uid 字段都不被信任；需要 `auth.hrpauth.service_client_id/secret` 已配置。
- **载荷**（`internal/service/match.go::TeamReportInput`）：

| 字段 | 必填 | 说明 |
|---|---|---|
| `match_type` | 是 | 对战类型（与 `matchmaking.modes` 同源） |
| `teams[]` 或 `winner_team`+`loser_teams[]` | 二选一 | 每队：`team_id`、`result`（win/lose/draw）、`initial_count`、`alive_count`、`members[]` |
| `members[]` | — | `uuid`（必填）、`survival_time`、`kills`、`deaths`、`perf_tweak` |
| `started_at` / `finished_at` | 是 | RFC3339 或 `YYYY-MM-DD HH:MM:SS`（UTC） |
| `duration_seconds` | 否 | 提供则必须与起止差一致 |
| `game_id` | 否 | 上报方稳定幂等键 |
| `source` | 否 | `game`（默认）/ `virtual`（运维调试数据；仅标记，不分流结算） |
| `map_name` / `server_id` | 否 | 展示与排查用 |
| `matchmaking_group_id` | 否 | 关联匹配成局，触发 party 共享结算 |

- **幂等**：提供 `game_id` 时，载荷规范化哈希（成员按 UUID 排序、队伍按 team_id 排序后计算）一致的重放返回既有记录（200，不重复结算）；哈希不一致以 409 `mca_game_id_conflict` 拒绝。并发竞态由 `uk_game_id` 唯一键兜底。
- **可观测**：`mca_report_inconsistent` 与 `mca_game_id_conflict` 两类拒绝进入有界内存环（脱敏），经 `GET /api/matches/rejections`（OPS）只读暴露；计数器经 `GET /api/metrics`（OPS）暴露。

## 数据形态与迁移

### schema 迁移（`migrate/`）

- 簿记表 `schema_migrations(service, version, name, applied_at)`；本服务名 `MatchCoreArena-Server`。
- 启动自动执行：`GET_LOCK` 咨询锁串行化多实例（60s 超时），重读已应用集合，只跑未记录版本；每条迁移幂等可重入，失败即阻断启动、下次重跑。
- **v1 baseline（冻结）**：`migrate/migrations/baseline.sql` 全 `CREATE TABLE IF NOT EXISTS`——`users`、`friends`、`teams`、`team_members`、`matches`、`match_participants`、`matchmaking_queue`、`matchmaking_parties`、`matchmaking_party_members`、`matchmaking_groups`、`matchmaking_group_members`、`rankings`。
- **v2 增量**（`migrate/m002_additions.go`）：为旧库补齐统一上报与组队匹配结构——`matches` 加 `source`/`map_name`/`server_id`/`game_id`/`payload_hash` 五列与 `uk_game_id`，`match_participants` 加 `is_draw`，建 `matchmaking_*` 五张表；每条 DDL 前查 `information_schema`，列定义与 baseline 逐字一致（含列序）。两条路径（全新库 / 旧库升级）终态 schema 完全一致。
- 结构变更一律追加新版本迁移，不改 v1；降级运行（簿记有更高版本）只告警不阻断。

### 关键表语义

- `users`：uid 即 HRPAuth uid；`rank_score`（评分，下限 0）、`wins_count`（定级判定）、`experience`/`level`。结算事务内懒建行。
- `matches` + `match_participants`：对局主表与参与者明细（赛前分、Δ、KDA、生存时长）；`uk_game_id` 幂等。
- `matchmaking_queue`：`uk_user` 保证每人至多一条；`rank_score` 为入队时快照。
- `rankings`：`(user_uid, rank_type, season)` 唯一，结算时增量维护。

### 配置迁移链（`config/config.go`）

顶层 `version` 从 1.0.0 到 1.9.0 顺序迁移（内存中执行，不回写文件）；超前版本拒绝加载。关键节点：1.2.0 收敛为 `auth.hrpauth.base_url`；1.4.0 加 `maintenance_token`（缺失自动生成）；1.5.0 加 `service_client_id/secret` 与 matchmaking 块；1.7.0 对局上报收敛为单一入口（移除虚拟对局独立开关）；1.8.0 加 `matchmaking.join_target`；1.9.0 加 `ranking.tiers`。

## 扩展点与边界

- **新增匹配模式**：配置 `matchmaking.modes` 追加条目即可（引擎与结算都不硬编码模式）；`match_type` 同时是对局上报与排行榜的类型键。
- **新增服务凭据**：`tokens.yaml` 加条目（自定义 uid 与 scopes），重启生效。
- **好友/战队端点**：显式未实现（返回 501 `mca_not_implemented`），勿当作可用契约。
- 决策记录在本仓 `knowledge/`（评分模型 0001、上报链路 0002/0009/0011、生态边界 0008、迁移 0017 等）。
