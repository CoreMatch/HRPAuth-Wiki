---
title: BedwarsRel-MCA 部署者文档
description: BedwarsRel-MCA 的安装、match-reporting 配置（api-url 与 OPS 凭据）、上报成功验证与故障对照。
order: 1
tags:
  - bedwarsrel
  - deployment
updatedAt: 2026-11-08
---

# BedwarsRel-MCA — 部署

BedwarsRel-MCA 是 BedwarsRel（Minecraft 起床战争 Bukkit 插件）的 fork：玩法 100% 上游，fork 只加了**对局结果上报**（把每局结果送进 MatchCoreArena-Server 结算）与构建现代化。

**形态说明**：它是插件 jar，装进第三方 MC 服务器进程，不是本生态自管的独立进程——仓库根的 `deploy-manifest.yaml` 以 `kind: plugin` 向编排器登记（安装目标 `bukkit-server` 的 `plugins/` 目录、产物、对 mca-server 的 required 依赖），但 HA-Cupbearer 对插件条目**只登记与校验、不执行安装**（阶段未设）。

**支持矩阵收窄**：只支持 Minecraft **1.8.x 与 1.12** 服务端（Spigot/Paper/CraftBukkit）；1.9–1.11 没有 NMS 模块，装不上。

## 运行前提

| 项 | 要求 |
|---|---|
| 服务端 | CraftBukkit/Spigot/Paper **1.8 / 1.8.3 / 1.8.8 / 1.12** 之一 |
| Java | 与服务端匹配（1.8 时代 Java 8；1.12 常用 Java 8） |
| 构建 | Java + Maven；CraftBukkit jar 需自备（见下） |
| MatchCoreArena-Server | 一个可达的 MCA-Server + 一份 OPS 上报凭据（`match:report` scope） |

## 构建与安装

### 1. 构建（需要自备 CraftBukkit jar）

NMS 模块依赖的 CraftBukkit jar **不在仓库里**（未跟踪），必须自备四个文件放到仓库根目录：`craftbukkit-1.8-R0.1-SNAPSHOT.jar`、`craftbukkit-1.8.3.jar`、`craftbukkit-1.8.8.jar`、`craftbukkit-1.12.jar`，然后：

```sh
./build.sh                 # 检查 Java/Maven → build/get-dependencies.sh 把 jar 装进本地 Maven 仓 → mvn package
```

产物：`plugin/target/BedwarsRel-1.3.6-SNAPSHOT.jar`（默认 profile；`release` profile 产出 `BedwarsRel-1.3.6.jar`）。

没有这些 jar 时只有 `mvn -pl common` 能构建；GitHub Actions CI 也只构建 `common` 模块（CI 绿不代表整仓能构建）。

### 2. 装入服务端

把产物 jar 放进服务端 `plugins/` 目录，重启服务端。插件数据目录为 `plugins/BedwarsRel/`。

### 3. 配置上报

编辑 `plugins/BedwarsRel/config.yml` 的 `match-reporting` 段（首次启动自动生成默认值）：

```yaml
match-reporting:
  enabled: true
  api-url: "https://arena.mcnb.dev/api/matches"   # MCA-Server 的上报端点
  credentials:
    service-token: "<tokens.yaml 里的 match-reporter token>"
  # ... 其余见下表
```

凭据二选一（都配时 service-token 胜出）：

- **形态 A（推荐）**：`credentials.service-token` 填 MCA-Server `config/tokens.yaml` 中持 `match:report` scope 的服务令牌（如 `match-reporter`）。
- **形态 B**：OAuth2 `client_credentials` 三件套 `credentials.token-url` / `client-id` / `client-secret`（scope 默认 `match:report`）；换来的 access token 缓存至临近过期，401 后重新获取。

改完 `reload` 或重启服务端生效。

## 配置项表（match-reporting 段）

| 键 | 默认 | 作用 |
|---|---|---|
| `enabled` | `true` | 上报总开关 |
| `api-url` | `https://arena.mcnb.dev/api/matches` | 上报端点（MCA-Server `POST /api/matches` 的完整 URL）；留空 = 上报不工作 |
| `access-token` | `your-access-token-here`（占位） | 旧版静态令牌键，等价 `credentials.service-token`；保留占位值即不启用 |
| `credentials.service-token` | `""` | 形态 A：静态服务令牌 |
| `credentials.token-url` / `client-id` / `client-secret` | `""` | 形态 B：client_credentials 三件套 |
| `credentials.scope` | `match:report` | 形态 B 请求的 scope |
| `timeout-millis` | `5000` | 连接/读超时（最小 100） |
| `retry.max-attempts` | `3` | 每局总投递次数（1 = 不重试）；仅 5xx 与网络失败重试，4xx 记录后丢弃 |
| `retry.delay-millis` | `2000` | 重试基础延迟，按次翻倍，封顶 30s |
| `retry.queue-capacity` | `64` | 待投递队列上限；满了之后的对局丢弃并告警 |
| `ledger-capacity` | `2000` | 已成功上报 game_id 的记忆条数（幂等，跨重启持久） |
| `dead-letter-capacity` | `200` | 死信文件条数上限，超出从最旧淘汰 |

## 验证上报是否成功

1. **启动自检**：插件启用时日志输出一行状态——`enabled=...`、`endpoint=...`、`credentials=service-token(set)`（只显示形态，不打印密钥）、重试参数、ledger 与死信条数。`credentials=missing` 或 `endpoint=<unset>` 说明配置没生效。
2. **打完一局后**：
   - 服务端控制台/日志无 4xx 拒绝记录；
   - 游戏内执行 `/mca deadletter`（权限 `bw.mca`，OP/控制台）——返回 `no dead-letter records` 即无投递失败积压；
   - 到 MCA-Server 侧核对数据真的到了（OPS 凭据）：

```sh
# 全局最近对局（OPS）
curl -s -H "Authorization: Bearer <OPS token>" "https://arena.mcnb.dev/api/matches?page_num=1&page_size=5"
# 期望 200，data 里能看到刚结束那局（map_name、finished_at 对得上）
```

   - 或在客户端（MCA-Client）的 Career 页看到该局与分数变动；
   - 插件数据目录出现/增长 `mca-reported-matches.log`（已上报 ledger）。
3. **幂等确认**（可选）：同一局不会重复结算——重复上报同一 `game_id` 服务端返回 200 幂等重放。

## 故障对照

| 现象 | 原因 | 处理 |
|---|---|---|
| 启动自检 `credentials=missing` | 两种凭据形态都没配（或还是占位符） | 配 `credentials.service-token`；期间上报跳过、告警，不影响游戏 |
| 启动自检 `endpoint=<unset>` | `api-url` 为空 | 填 MCA-Server 上报端点 |
| 日志有 4xx 拒绝（含响应体），不重试 | 服务端类型化拒绝：401/403 凭据无效或权限不足、400 载荷不一致、404 参与者不存在、409 game_id 冲突 | 按响应体里的错误码处理：401/403 换有效 `match:report` 令牌；409 查是否重复使用了 game_id |
| 5xx/网络失败后进死信 | 重试 `max-attempts` 次仍失败 | 恢复 MCA-Server 连通后 `/mca replay [n]` 重放（默认 10 条、上限 50）；重放不会重复结算 |
| `/mca deadletter` 报 N 条 | 有 N 条未投递成功记录 | 同上，先修连通再 replay |
| 队列满告警、个别对局没上报 | 积压超过 `retry.queue-capacity` | 调大容量或排查下游为什么慢 |
| 插件在 1.9–1.11 服务端不工作 | 不在支持矩阵 | 换 1.8.x 或 1.12 服务端 |
| 构建时 NMS 模块失败 | 仓库根缺 CraftBukkit jar | 按"构建"一节补齐四个 jar 再跑 `./build.sh` |
| 中途退出的玩家 KDA 是 0 | 其统计在离开时已合并重置（已知行为） | 预期行为，不是故障 |
