---
title: MatchCoreArena-Client 开发者文档
description: MCA-Client 的代码结构、前端与 Go 侧边界、与 Server 的接口、INTEROP-SPEC v1 交接发送端、构建与测试。
order: 2
tags:
  - matchcorearena
  - development
updatedAt: 2026-11-08
---

# MatchCoreArena-Client — 开发

## 代码结构

```
main.go                Wails 引导：embed frontend/dist 为资产，绑定 App
app.go                 App 结构：全部 Go↔JS 绑定方法（认证/用户/好友/排行/
                       对局只读/匹配/交接/本地设置）
internal/
  config/              ~/.matchcorearena/config.json 加载与保存、
                       server_url 三级优先级
  handlers/            绑定 handler 层（AppHandler：会话、API 调用、
                       interop 生命周期）
  interop/             对局交接发送端（INTEROP-SPEC v1，回环通道）
  models/              领域与 API 模型（auth/user/friend/match/
                       matchmaking/ranking）
  services/            API 服务层（net/http 直连，10s 超时，Bearer 注入）
frontend/
  src/components/      LoginView / PlayView / MyMatchesView / RankingView /
                       FriendList / SettingsView / RankCard
  src/i18n/            中央消息目录（英文为源语言）
ha-ui/                 git 子模块：共享设计系统 @ha/ui（file: 依赖）
```

## 构建与测试

```bash
make dev               # wails dev
make build             # wails build → build/bin/MatchCoreArenaClient
make test              # go test ./...（服务层测试基于 httptest，无外部依赖）
make check             # go fmt + go vet + 前端 lint + typecheck
```

CI（`.github/workflows/build.yml`，push main/develop 与 PR）：递归检出（子模块）→ Go 1.26 + Node 22 → 前端构建 → `go test ./...` → typecheck/lint → 装 GTK/WebKit 构建依赖与 Wails CLI v2.15.0 → `wails build` → 上传 `build/bin/` 为工作流产物。

发布（`.github/workflows/release.yml`，`v*` tag 触发）：同一构建链 + mingw 交叉编译 Windows 产物。**仓库至今无 tag，该流程从未运行**；Windows 产物未经 CI 验证、无签名（仓内 knowledge 0008 有录）。

## 前端与 Go 侧边界

- 唯一通道是 Wails Bind：`app.go` 的导出方法就是前端能调用的全部 Go 面（`internal/handlers/app.go` 承载实现）。
- **前端零直接网络调用**是硬不变量：所有 HTTP 走 `internal/services`（`services/api.go::APIService`）。仓内有不变量测试钉住三件事——绑定面形状、前端无直接网络调用、生成绑定与 Go 面同步（knowledge 0011 记录复核步骤）。
- 前端状态驱动：Play 页的队列循环（idle → queued → found → in-match → settled）由 `GET /api/matchmaking/status` 轮询驱动。

## 与 Server 的接口

只读 + 玩家自身会话/队列操作；**从不调用对局上报入口**（`POST /api/matches` 不在客户端路径内）。

| 分组 | 端点 |
|---|---|
| 认证 | `/api/auth/login-ticket`、`/api/auth/totp-verify`、`/api/auth/refresh`、`/api/auth/logout` |
| 用户 | `/api/users/me` |
| 好友 | `GET /api/friends`（服务端未实现，应答 501 `mca_not_implemented`） |
| 对局 | `GET /api/matches/{id}`、`GET /api/matches/me` |
| 匹配 | `POST /api/matchmaking/join`（单人或 `party_members` UUID 名单）、`DELETE /api/matchmaking/leave`、`GET /api/matchmaking/status` |
| 排行 | `GET /api/rankings/{type}`、`GET /api/rankings/me`、tiers 展示（契约 v1.7.0） |

评分只在客户端**展示**，从不计算——分数变动全部取服务端结算结果（`match_participants` 的 Δ）。

## 对局交接发送端（INTEROP-SPEC v1）

`internal/interop/interop.go`：成局结算后把无凭据载荷交给 SamuelClient，Linux 优先。

- **发现**：双方各写一个发现文件（发送端 `mca-client.json`、接收端 `samuel-client.json`），目录 `$XDG_RUNTIME_DIR/matchcore-interop`，回落 `~/.config/matchcore-interop`；内容含协议版本、pid、回环端口、token。读取时校验 pid 存活，陈旧文件视为不存在。
- **join_target 优先级**：成局携带的服务端 `join_target`（契约 v1.6.0）> 本地配置 `game_server_host/port` > 都没有则 `missing_config` 降级（界面给可复制 host:port）。
- **Flow A**（接收端在运行）：直接 `POST /v1/join`（Bearer 用发现文件里的 token）。200 = 送达；503 = 对方忙；422 = 版本不匹配。
- **Flow B**（接收端未运行）：发送端保留载荷供拉取（自身回环监听 `GET /v1/handoff/{id}`，首次成功读取即消费），打开 `matchcore://join?handoff_id=...` 深链唤醒，重试 30 秒（每 2 秒）。
- **凭据防火墙**：载荷只有 match_id、mode、map_name、join_target——永不携带令牌（INTEROP-SPEC §5）。载荷 TTL 10 分钟，单槽位（§6）。
- **平台缺口**：Windows 上 pid 探测不可用、Windows/macOS 上深链未实现（§10），均降级为手动加入。
- 交付状态机对 UI 暴露：`idle / delivering / delivered / waiting_receiver / busy / timeout / no_receiver / version_mismatch / missing_config / error`。

## 配置加载（`internal/config/config.go::LoadConfig`）

`server_url`：配置文件非空值 > `MCA_SERVER_URL` 环境变量 > 内置默认 `https://arena.mcnb.dev/`。其余字段（`debug`、`game_server_host`、`game_server_port`）只从配置文件取，缺省为零值。保存经 `SaveConfig`（设置页写回）。

## 扩展点与边界

- **新增绑定方法**：`app.go` 加导出方法 + `internal/handlers` 实现 + 前端生成绑定同步（不变量测试会钉住漂移）。
- **i18n**：`frontend/src/i18n` 中央目录，英文为源语言，locale 接口已预留。
- **交接协议**：`interop.ProtocolVersion = 1`；版本不匹配时双方按"升级落后一方"处理，不做向下兼容。
- 决策记录在本仓 `knowledge/`（只读客户端 0010、交接协议 0012、单一 base_url 0002、生态边界 0007 等）。
