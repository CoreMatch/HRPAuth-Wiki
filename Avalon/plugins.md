---
title: Avalon 插件三档
description: Avalon 进程外插件的三档语义（observe/veto/deliver）、双闸门否决授权、插件明确不做的事。
order: 2
tags:
  - plugin
  - extension
  - governance
updatedAt: 2026-11-08
---

# 插件三档

Avalon 插件是独立进程：观察服务器行为，并可选地否决动作。本页概述模型，帮助判断哪一档适合什么场景；完整开发者文档在 Avalon 仓的 `docs/plugins/`。

## 插件是什么

插件是 HTTP **服务端**：插件作者自己起进程，Avalon 作为客户端调用它。方向严格单向——Avalon 调用插件。插件从不主动连接 Avalon、从不查询 Avalon，游戏引擎的 JVM 里也永远不加载任何第三方代码。契约权威是 HA-Contract 的 `docs/api/openapi/avalon-plugin-v1.yaml`。

## 三档语义

| 档位 | 语义 | 插件不可达时 Avalon 怎么办 | 适合场景 |
|---|---|---|---|
| **observe** | 尽力送达的只读通知，返回 2xx 确认即可 | 丢弃该事件并计数，不重试 | 审计、统计镜像、通知——丢一条可以接受的场景 |
| **veto** | 同步咨询，插件可回"不允许"并附可读理由 | fail-open：当作没有否决，动作照常 | 准入策略：建房、玩家进入、连接过滤、开局、对局内指令治理 |
| **deliver** | 异步至少一次投递，走持久化队列；插件必须按 `eventId` 去重 | 退避重试；Avalon 重启后重放 | 绝不能丢的数据：对局结算、记账级流水 |

否决咨询有硬超时（准入类默认预算较宽，对局内指令预算更紧），超时同样 fail-open。坏掉或太慢的插件不会卡死服务器。

## 哪些事件可以被否决

多数事件只有观察档。否决参与分两种形式：

- **订阅即参与**：`room.create`——订阅它即参与建房准入。
- **须显式授权**：`player.join`、`unit.operation`、`factory.build`、`connection.new`、`game.start`——否决这些事件需要**双闸门**同时满足：插件 manifest 对该事件声明 `veto: true`，**且**运营把该插件写进该事件的 `vetoEvents` 授权清单。只满足任一闸门都不生效；默认拒绝。判定在 `internal/plugin/hub.go::vetoConsulted`。

事件全集的权威清单（事件名、载荷、否决后果、超时预算）是 Avalon 仓 `docs/plugins/EVENT-CATALOG.md` 的事件目录，其中带有机器可读区块，由 CI 与代码、契约三方同步校验。

## 否决之后发生什么

| 事件 | 否决的可观察后果 |
|---|---|
| `room.create` | 建房不发生（启动失败并带理由 / 代理回绝 / relay 错误信道携带理由） |
| `player.join` | 玩家进入后被立即踢出，净化后的理由送达玩家 |
| `game.start` | 本次开局取消；发起管理员收到理由，自动开局只进日志 |
| `unit.operation` / `factory.build` | 指令包在进引擎前被丢弃；理由只进日志 |
| `connection.new` | 裸连接在首包时刻即断开；理由只进日志 |

## 插件不做什么

以下是方向性排除，不是待做功能（Avalon 仓 `docs/plugins/NON-GOALS.md`）：

- 不提供对局内引擎状态（击杀、伤害、经济、位置）——引擎闭源，Avalon 没有可靠真值来源。
- 不拦截控制台运维命令——最后的控制手段必须对第三方故障免疫。
- 没有插件→玩家的写通道（发消息、踢人、禁言），也没有插件→Avalon 的查询通道——契约严格单向。
- 不提供 relay 侧事件；不在 JVM 内加载（永不）；运行期不下载、不自更新插件产物；不为 mod 设计插件接口。

## 插件的运维

插件在 Avalon 的 `data/Plugins.json` 登记：名字、base URL、共享 hex 密钥、启用开关、`vetoEvents` 授权清单。

- **空配置 = 零回归**：文件不存在或条目为空时，所有准入路径立即放行，不发生任何网络 I/O。
- **非法配置 = 启动失败**：坏 JSON、重名、非法 URL、密钥过短、未知否决事件都会让 Avalon 启动失败，错误信息指明条目与字段。没有静默降级。
- **无热加载**：启用、停用、修改插件都需要重启 Avalon。快速关闭一个出问题的插件 = 把该条目 `enabled` 改为 false（或清空 entries）后重启。
- 请求/应答完整性由共享密钥的双向 HMAC 签名保护；轮换密钥时新旧并存即可。

## 相关

- [Avalon](./index.md)：大厅模式与模组门槛
- Avalon 仓 `docs/plugins/`：GETTING-STARTED、EVENT-CATALOG、AUTH-AND-NEGOTIATION、FAILURE-MODES、NON-GOALS，以及可直接运行的 Go 模板（含自测试）
- Avalon 仓 `knowledge/0006-out-of-process-plugin-extension-points.md` 与 `knowledge/0010-plugin-v2-implementation-status.md`：设计决策与落地状态
