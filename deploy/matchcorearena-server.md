---
title: MatchCoreArena-Server 部署者文档
description: MCA-Server 的运行前提、从零部署、配置项全表、端口与鉴权暴露面、启停升级回滚、部署验证与故障对照。
order: 1
tags:
  - matchcorearena
  - deployment
updatedAt: 2026-11-11
---

# MatchCoreArena-Server — 部署

MatchCoreArena-Server（MCA-Server）是竞技平台的匹配与结算核心：独立 Go/Gin HTTP 服务，不依赖任何 Minecraft 服务端运行时。职责：匹配排队与成局、对局上报与加权 Elo 结算、排行榜、好友/战队数据。

## 运行前提

| 项 | 要求 |
|---|---|
| 操作系统 | Linux（二进制 `CGO_ENABLED=0` 静态构建） |
| Go | 仅源码构建需要：`go.mod` 声明 `go 1.26.10` |
| MySQL | 必需，唯一事实源（启动硬依赖：连接或 Ping 失败即退出）。字符集 utf8mb4 / InnoDB；最低版本仓库未声明 |
| Redis | 必需，仅作缓存（启动硬依赖：连接失败即退出）。最低版本仓库未声明 |
| HRPAuth | 必需，唯一出站运行时依赖：启动期校验可达；玩家令牌校验、参与者 UUID→uid 解析都走它 |
| 进程监督 | 生产声明为 `manager: aapanel`（面板管理，Deployer 编排器对其只读） |

数据库与库名按配置准备（默认库名 `matchcorearena`）；**表结构不用手工建**——启动时版本化迁移自动执行（咨询锁串行化，幂等可重入）。

## 从零部署

### 1. 构建

```sh
CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o build/mca .
```

（Dockerfile 构建行原文。产物为单文件二进制 `mca`。）

### 2. 配置

```sh
cp config/config.example.yaml config/config.yaml
```

按下文配置项表修改。两个路径覆盖机制：

- 配置文件路径：默认 `config/config.yaml`（相对工作目录），环境变量 `CONFIG_PATH` 覆盖。
- 服务凭据文件路径：默认 `config/tokens.yaml`，`auth.tokens_path` 配置项覆盖，环境变量 `MCA_TOKENS_PATH` 优先级最高。

配置文件不存在时首次启动会按内置默认值自动生成；`tokens.yaml` 不存在时首次启动自动生成随机凭据（见"服务凭据"一节）。

### 3. 启动

```sh
cd /www/wwwroot/mca      # 生产在位目录（deploy-manifest install.root）
./mca
```

启动顺序（任一硬依赖失败即退出）：加载并迁移配置 → 执行数据库迁移 → Ping MySQL → 连 Redis → 校验 HRPAuth 可达 → 加载 `tokens.yaml` → 注册路由 → 启动匹配引擎 → 监听 `:9178`。

生产形态按 `deploy-manifest.yaml`：二进制在位 `/www/wwwroot/mca/mca`，进程归 aapanel 管理，配置在位 `/www/wwwroot/mca/config/config.yaml`。不要用 Deployer 编排器去动它（`manager: aapanel` 的项目一律 foreign 只读）。

### 容器形态（镜像已发布，当前生产为裸金属）

镜像已发布到 Docker Hub：`limeight/ha-mca-server`（`linux/amd64` + `linux/arm64` 多架构，tag `1.11.0-699d7bf` 并列 `latest`，生效引用钉 manifest list digest `sha256:4b45285991bdcc7a1ff1f76d744575be62531afdc1ba2736beeafb023893b99c`）。仓内多阶段 Dockerfile（builder `golang:1.26.4-alpine` → 运行 `alpine:3.22`，`EXPOSE 9178`，非 root 用户），`docker-entrypoint.sh` 支持用 `CONFIG_TEMPLATE` + `RENDERED_CONFIG` 环境变量经 envsubst 渲染配置。

当前生产部署形态是裸金属（清单 `runtime` 默认 `baremetal`）；容器运行时可用——经清单 `runtime: container` 或部署上下文覆盖（`orchestration.overrides`）切换，由 HA-Services-Deployer 编排。注意容器形态必须**独占数据库**（与其他服务共库会因 `schema_migrations` 簿记表互踩）。

## 服务凭据（tokens.yaml）

高权限服务凭据独立于 HRPAuth 用户体系，供系统间调用与游戏服上报：

```yaml
tokens:
  match-reporter:
    token: "<长随机串>"
    uid: -100            # 虚拟 UID，建议负数
    scopes:
      - "match:report"
      - "user:read"
```

- 文件不存在时自动生成两个默认凭据：`super-admin`（uid -1，scope `maintenance`，全权限）与 `match-reporter`（uid -100，scope `match:report` + `user:read`），token 为随机 64 位十六进制。**首次生成后务必记录 super-admin token**。
- 对局上报唯一入口 `POST /api/matches` 只接受持 `match:report` scope 的 OPS 级凭据；把 `match-reporter` 的 token 配到上报方（BedwarsRel-MCA 的 `match-reporting` 配置）。
- 文件解析失败时仅告警、不挡启动，但所有服务凭据失效（上报全部 401）。

## 配置项表

配置为 YAML，启动时读取，**改动一律重启生效**。顶层 `version` 必须 ≤ 代码支持版本（当前 `1.11.0`）；低版本沿内置迁移链自动升级（内存中执行，不回写文件），高版本直接拒绝启动。

### server

| 键 | 默认 | 作用 |
|---|---|---|
| `host` | `0.0.0.0` | 监听地址 |
| `port` | `9178` | 监听端口（1–65535，非法即启动失败） |
| `read_timeout_seconds` | `15` | 读超时 |
| `write_timeout_seconds` | `15` | 写超时 |

### database

| 键 | 默认 | 作用 |
|---|---|---|
| `host` | `localhost` | MySQL 地址（必填） |
| `port` | `3306` | MySQL 端口 |
| `user` | `root` | 用户 |
| `password` | `""` | 密码（生产建议经环境注入，勿提交明文） |
| `name` | `matchcorearena` | 库名（必填） |
| `max_open_conns` | `50` | 最大打开连接（不得为负） |
| `max_idle_conns` | `10` | 最大空闲连接（不得为负） |

### redis

| 键 | 默认 | 作用 |
|---|---|---|
| `host` | `localhost` | Redis 地址 |
| `port` | `6379` | Redis 端口 |
| `password` | `""` | 密码 |
| `db` | `0` | DB 编号 |

### auth

| 键 | 默认 | 作用 |
|---|---|---|
| `hrpauth.base_url` | 无（必填） | HRPAuth 根地址，如 `http://localhost:2778`；所有 OAuth2 端点调用与令牌校验的根 |
| `hrpauth.public_client_id` | `hrpauth-webui` | OAuth2 public client_id（refresh_token 等第一方流程） |
| `hrpauth.service_client_id` | `""` | ops 级服务凭据（client_credentials），用于结算时解析参与者 UUID→uid；注入 HRPAuth 内置 super client 凭据。留空不挡启动，但结算上报以类型化错误失败 |
| `hrpauth.service_client_secret` | `""` | 同上 |
| `maintenance_token` | 首次创建自动生成 64 位随机十六进制 | 运维超级凭据，拥有所有权限 |
| `tokens_path` | `config/tokens.yaml` | 服务凭据文件路径（`MCA_TOKENS_PATH` 环境变量优先级更高） |

### matchmaking

| 键 | 默认 | 作用 |
|---|---|---|
| `enabled` | `true` | 匹配引擎总开关；false 时不启动后台引擎，join 返回"匹配系统未启用" |
| `tick_seconds` | `1` | 引擎扫描周期（必须为正） |
| `queue_timeout_seconds` | `300` | 排队超时秒数，超时移出队列（必须为正） |
| `base_rating_window` | `200` | 基础分差窗口（必须为正） |
| `rating_window_growth_per_minute` | `100` | 窗口随等待时长的放宽速率/分钟（不得为负） |
| `max_rating_window` | `1000` | 分差窗口上限（必须为正） |
| `modes` | `1v1 [1,1]`、`2v2 [2,2]` | 可排队模式与各队人数；match_type 不得为空或重复，team_sizes 必须全为正 |
| `assignment_ttl_seconds` | `1800` | 成局分配有效期（秒，1.10.0+）：`GET /api/matchmaking/assignment/:uuid` 只认 formed_at 距今未超该值的成局（必须为正） |
| `room_reservation_ttl_seconds` | `900` | 房间预占 TTL（秒，1.11.0+）：成局时对预占房间的保留时长（必须为正） |
| `servers` | 不配置 | 子服→房间静态清单（1.11.0+，可选）：**整体不配置 = 不启用房间层**，保持 1.9.x 行为；显式空清单会被拒绝。启用时每个子服 `name`/`host`/`port` 必填、不得重名，每个子服至少一个房间，房间 `name` 必填、`capacity` 为正 |
| `join_target.host` | `""` | 全局游戏服地址（无房间层时成局记录携带它）；留空 = 未配置，成局响应不携带，客户端回落本地配置。**接入 Velocity 代理（VelocityGate）时**：代理按成局记录的 `join_target` 路由——启用房间层则携带绑定子服地址（来自 `servers`），未启用则携带本字段；代理侧 `servers[].target` 必须与成局实际携带的地址逐字一致 |
| `join_target.port` | `0` | 配置了 host 时端口必须 1–65535 |

### ranking

| 键 | 默认 | 作用 |
|---|---|---|
| `tiers` | `[]` | 段位阶梯（`name` + `min_score`），纯展示、不参与结算；留空前端不显示进度条。配置时 name 必填、min_score 非负 |

## 端口与暴露面

只有一个端口：

| 端口 | 用途 | 暴露 |
|---|---|---|
| `9178`/tcp（`server.port`） | 全部 HTTP API | 公网（deploy-manifest `exposure: public`） |

### 端点鉴权分级

| 级别 | 端点 |
|---|---|
| 公开（无鉴权） | `GET /api/status`（健康 + 版本）；`POST /api/auth/login-ticket`、`POST /api/auth/totp-verify`、`POST /api/auth/refresh` |
| 任意有效令牌（玩家 Bearer / 服务令牌 / 运维令牌） | `GET /api/users/me`、`GET /api/users/:uid`、`GET /api/users/:uid/matches`、`POST /api/users/me/experience`、好友与战队全部端点、`POST /api/matchmaking/join`、`DELETE /api/matchmaking/leave`、`GET /api/matchmaking/status`、`GET /api/matches/:id`、`GET /api/matches/me`、排行榜三端点、`POST /api/auth/logout` |
| 仅 OPS 级凭据（运维令牌 / tokens.yaml 服务令牌） | `POST /api/matches`（另需 `match:report` scope）、`GET /api/matches`、`GET /api/matches/by-game-id/:game_id`、`GET /api/matches/rejections`、`GET /api/metrics`、`GET /api/matchmaking/assignment/:uuid`（玩家令牌一律 403；响应只含路由所需最小信息，不回显成员名单与评分——消费方是 Velocity 代理一类的可信基础设施） |
| 仅 `maintenance` scope（运维令牌 / super-admin 服务令牌） | `POST /api/maintenance/sql`（直接执行 SQL 的维护通道，body `{"sql": "..."}`） |

令牌经 `Authorization: Bearer <token>` 传递（`?access_token=` 查询参数仅留给无法设 header 的场景）。玩家令牌校验结果在 Redis 缓存 5 分钟；`maintenance` scope 视为拥有所有权限。

## 启动 / 停止 / 升级 / 回滚

**启动**：面板形态经 aapanel 操作；独立形态直接 `./mca`（注意工作目录决定默认配置相对路径）。

**停止**：终止进程。代码无信号处理与优雅退出逻辑；匹配队列存于 MySQL，重启后由引擎首轮 tick 按超时规则清理，天然恢复。

**升级**：

1. 停止进程；
2. 替换二进制；
3. 启动。配置文件低版本自动内存迁移（不回写文件）；数据库迁移自动补增量（只增不改，咨询锁串行化）。

**回滚**：换回旧二进制重启。两个边界：

- 数据库迁移只增不删，旧二进制在新结构上照常运行；若簿记中出现旧二进制未知的更高迁移版本，启动日志出现降级警告（不阻断）。
- 配置文件 `version` 高于旧二进制支持版本时启动直接失败（"请升级程序"）——配置迁移不回写文件，正常升级不会抬高文件里的版本号，手工改过 version 的要注意。

## 验证

```sh
# 健康 + 版本（公开端点）
curl -s http://127.0.0.1:9178/api/status
# 期望 200：
# {"success":true,"message":"MatchCoreArena Server 运行中","data":{"version":"1.11.0"},"meta":{"request_id":"..."}}
# （version = 装载迁移后的配置版本，恒等于代码 config.CurrentVersion）
```

```sh
# OPS 面可用（用 tokens.yaml 中任一有效令牌）
curl -s -H "Authorization: Bearer <token>" http://127.0.0.1:9178/api/metrics
# 期望 200：{"success":true,...,"data":{"counters":{...},"queue_depth":{...}}}
```

```sh
# 上报链路可用（match-reporter 令牌；虚拟对局即可验证全链路）
# 队伍形状二选一：teams（每队带 result）或 winner_team + loser_teams
curl -s -X POST -H "Authorization: Bearer <match-reporter token>" \
  -H "Content-Type: application/json" http://127.0.0.1:9178/api/matches \
  -d '{"match_type":"1v1","source":"virtual","game_id":"smoke-test-1","teams":[{"team_id":"A","result":"win","initial_count":1,"alive_count":1,"members":[{"uuid":"<HRPAuth 中存在的玩家 UUID>"}]},{"team_id":"B","result":"lose","initial_count":1,"alive_count":0,"members":[{"uuid":"<另一名玩家 UUID>"}]}],"started_at":"2026-11-08T10:00:00Z","finished_at":"2026-11-08T10:05:00Z"}'
# 期望 201：{"success":true,"message":"对战结果已记录",...}
# 同一 game_id 原样重发返回 200（幂等重放，不重复结算）；
# 同一 game_id 换载荷返回 409 mca_game_id_conflict
```

编排形态的冒烟判据与之一致（deploy-manifest smoke：`/api/status` 必须 200 且 `data.version` 非空）。

## 故障对照

只列实际会遇到且有依据的。

| 现象 | 原因 | 处理 |
|---|---|---|
| 启动失败"加载应用配置失败"，提示 version 高于当前支持版本 | 配置文件 `version` 超前于二进制 | 升级二进制，或将 version 改回二进制支持的值 |
| 启动失败"数据库 Ping 失败" / "数据库迁移失败" | MySQL 不可达、凭据错、库不存在 | 核对 `database.*`；先手工建库 |
| 启动失败"Redis 连接失败" | Redis 不可达/密码错 | 核对 `redis.*` |
| 启动失败"初始化 HRPAuth 客户端失败" | `auth.hrpauth.base_url` 不可达 | HRPAuth 是唯一出站依赖，先确保它在运行 |
| 启动日志警告 `service_client_id/secret 未配置` | ops 服务凭据留空 | 注入 HRPAuth super client 凭据；否则对局上报时参与者身份解析失败（`oauth_hrpauth_down`） |
| 上报 401 `oauth_token_expired` | 玩家令牌过期 | 客户端走 `POST /api/auth/refresh` |
| 上报 403 `oauth_insufficient_scope` | 非 OPS 凭据，或缺 `match:report` scope | 换 `match-reporter` 令牌 |
| 上报 409 `mca_game_id_conflict` | 同一 `game_id` 已存在且载荷不一致 | 查 `GET /api/matches/rejections` 与 `GET /api/matches/by-game-id/:game_id` 定位冲突源 |
| 上报 400 `mca_report_inconsistent` | `duration_seconds` 与起止时刻差不一致等载荷矛盾 | 修正上报载荷 |
| 上报 404 `mca_user_not_found` | 参与者 UUID 在 HRPAuth 中不存在 | 核对该玩家是否注册 |
| 上报 502 `oauth_hrpauth_down` | HRPAuth 不可达或服务凭据失效 | 恢复 HRPAuth / 核对服务凭据 |
| `tokens.yaml` 解析失败告警 | 文件 YAML 非法 | 修正语法；期间所有服务凭据不可用（上报 401），玩家令牌不受影响 |
| 启动日志降级警告（schema_migrations 未知版本） | 曾运行更高版本二进制做过迁移 | 预期行为，迁移只增不删，无需处理 |
