---
title: MatchCoreArena-VelocityGate 部署者文档
description: VelocityGate 插件的构建、装入 Velocity 代理、velocitygate.json 配置（mca_base_url/mca_token/lobby_server/servers 映射）、路由验证与故障对照。
order: 1
tags:
  - velocitygate
  - deployment
updatedAt: 2026-11-08
---

# MatchCoreArena-VelocityGate — 部署

VelocityGate 是 Velocity 代理插件：把"已成局的玩家"送进对应的后端游戏服。玩家连上代理后按 UUID 查一次 MatchCoreArena-Server 的成局分配（OPS 只读端点 `GET /api/matchmaking/assignment/{uuid}`，契约 1.9.1），查到有效分配且能映射到已注册服务器就转过去，其余一律留在大厅。**客户端零改动**；后端游戏服只对代理可达，不暴露公网。

**形态说明**：它是插件 jar，装进别人的 Velocity 进程，不是本生态自管的独立进程——仓库根的 `deploy-manifest.yaml` 以 `kind: plugin` 向编排器登记（安装目标 `velocity-proxy` 的 `plugins/` 目录、产物、对 mca-server 的 required 依赖），但 HA-Services-Deployer 对插件条目**只登记与校验、不执行安装**（阶段未设）。本页讲怎么把它装进一台 Velocity 代理。

## 运行前提

| 项 | 要求 |
|---|---|
| 代理 | Velocity 代理实例（velocity-api 3.4.0 兼容；插件以 3.4.0 为 provided 构建） |
| Java | 17+（构建目标 Java 17） |
| 构建 | Maven（`mvn -B package`） |
| MatchCoreArena-Server | 一个可达的 MCA-Server + 一份 OPS 级令牌（运维令牌或 tokens.yaml 服务令牌；玩家令牌会被 403 拒绝） |
| 大厅与游戏服 | Velocity 已注册的 `lobby_server` 与若干后端游戏服（游戏服只需对代理可达） |

## 构建

```sh
mvn -B package        # 产物 target/velocitygate-1.0.0.jar
mvn -B verify         # 构建 + 全部测试（CI 同款命令）
```

jar 内含注解处理器生成的 `velocity-plugin.json`（id `velocitygate`），放入 Velocity 即被识别。

## 安装与配置

1. 把 `target/velocitygate-1.0.0.jar` 放进 Velocity 的 `plugins/` 目录，重启代理。
2. 首启自动生成配置模板 `plugins/velocitygate/velocitygate.json`；编辑后重启（或按代理的插件重载机制）。

```json
{
  "mca_base_url": "https://arena.mcnb.dev",
  "mca_token": "<MCA OPS 服务令牌>",
  "lobby_server": "lobby",
  "query_timeout_ms": 2500,
  "servers": [
    {"target": "10.0.0.5:25565", "server": "bw-game-1"}
  ]
}
```

| 键 | 默认 | 作用 |
|---|---|---|
| `mca_base_url` | 无（必填） | MCA-Server 根地址 |
| `mca_token` | 无（必填） | OPS 级令牌；仍是占位符或缺失时插件整体降级为无操作（所有人留大厅） |
| `lobby_server` | 无（必填） | 大厅服务器名（Velocity 已注册）；初始落点与一切失败路径的归处 |
| `query_timeout_ms` | `2500` | 分配查询超时（必须为正） |
| `servers[].target` | — | 成局 `join_target` 的 `host:port`（host 大小写不敏感，端口必须精确相同）；未登记的地址不会被路由 |
| `servers[].server` | — | 该 target 对应的 Velocity 已注册服务器名 |

映射放配置而非代码：增删后端服无需重新构建插件。`servers[].target` 必须与 MCA 侧成局记录实际携带的 `join_target` 逐字一致——启用房间层（`matchmaking.servers`）时是绑定子服的地址，未启用时是全局 `matchmaking.join_target`；两边对不上时玩家会被留在大厅并提示"未配置对应的游戏服务器"。

## 行为与失败路径

| 场景 | 行为 |
|---|---|
| 有效分配 + 映射命中 + 目标服可达 | 转向目标服 |
| 无分配 / 已结算 / 已过 TTL（MCA 侧 `matchmaking.assignment_ttl_seconds`，默认 1800s） | 静默留大厅 |
| MCA 不可达 / 超时 / 响应异常 | 静默留大厅，**不阻断登录**，仅日志告警 |
| 成局有效但无 `join_target` | 留大厅，提示"匹配成功，但未提供游戏服务器地址，请联系管理员。" |
| `join_target` 未在 `servers[]` 登记 | 留大厅，提示"匹配成功，但代理未配置对应的游戏服务器，请联系管理员。" |
| 映射到的服务器未在 Velocity 注册 | 留大厅，提示"无法进入对局：目标服务器未就绪，请稍后重试。" |
| 连接目标服失败（宕机/人满等） | 留大厅，提示"进入对局服务器失败，已留在大厅，请稍后重试。" |

其他语义：每个会话只查一次；断线清除标记，重连重新查询——对局未结算且未过 TTL 时，掉线重连会被送回原游戏服。

## 验证

1. **无玩家基线**：代理日志无插件报错；玩家登录全部落在大厅（未成局时的默认行为）。
2. **路由链路**（需要一局真实成局）：
   - MCA 侧确认成局带 `join_target`（OPS 凭据）：

```sh
curl -s -H "Authorization: Bearer <OPS token>" \
  "https://arena.mcnb.dev/api/matchmaking/assignment/<玩家 UUID>"
# 期望 assigned:true 且 join_target 与 velocitygate.json servers[].target 一致
```

   - 该玩家连接代理后被送入目标服（代理日志可见路由动作）。
3. **降级验证**：临时把 `mca_base_url` 指向不可达地址并重启插件——玩家应全部留在大厅且登录不受影响，日志有告警。

## 故障对照

| 现象 | 原因 | 处理 |
|---|---|---|
| 所有人留大厅，日志有"降级为无操作" | 配置缺失或 `mca_token` 仍是占位符 | 填真实 OPS 令牌 |
| 成局玩家留大厅，提示"未提供游戏服务器地址" | MCA 侧成局记录无 `join_target` | 配置 MCA `matchmaking.join_target` 或房间层 `matchmaking.servers`（见 MCA 部署页） |
| 成局玩家留大厅，提示"未配置对应的游戏服务器" | `join_target` 未在 `servers[]` 登记，或端口/主机拼写不一致 | 对照 MCA 实际下发的地址补 `servers[]` 条目 |
| 提示"目标服务器未就绪" | 映射的服务器名未在 Velocity 注册 | 核对 Velocity 的服务器注册 |
| 日志有分配查询 403 | `mca_token` 用了玩家令牌 | 换 OPS 级令牌 |

## 当前状态（如实描述）

- 单元测试 21 个全绿（路由四路径、客户端失败路径、配置解析）；**没有在真实 Velocity 实例上联调过**——事件时序与真实玩家连接尚未被验证，首次上机需人工观察日志。
- 生态内当前没有 Velocity 代理实例与游戏服可对接；生产部署本插件的前提（代理、游戏服、MCA 侧 `join_target`/房间层）均未就位。
