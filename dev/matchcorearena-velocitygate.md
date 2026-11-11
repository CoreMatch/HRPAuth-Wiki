---
title: MatchCoreArena-VelocityGate 开发者文档
description: VelocityGate 插件的代码结构、路由决策链、失败分类与构建测试。
order: 2
tags:
  - velocitygate
  - development
updatedAt: 2026-11-12
---

# MatchCoreArena-VelocityGate — 开发

Velocity 代理插件（Java 17，velocity-api 3.4.0 provided）：把"已成局的玩家"送进对应后端游戏服。玩家连上代理后按 UUID 查一次 MCA 的成局分配（OPS 只读端点 `GET /api/matchmaking/assignment/{uuid}`，契约 1.9.1 起），查到有效分配且能映射到已注册服务器就转过去，其余一律留在大厅。客户端零改动；后端游戏服只对代理可达。

## 代码结构

```
src/main/java/io/github/corematch/velocitygate/
  VelocityGatePlugin.java      入口：插件生命周期、监听器注册、配置加载（缺失/占位符时整体降级为无操作）
  GateConfig.java              velocitygate.json 解析：必填项、映射归一化（host 大小写不敏感）、超时默认值
  GateRouter.java              路由决策：分配查询 → 映射命中 → 转向 / 留大厅（含玩家提示文案）
  McaClient.java               MCA 分配查询接口与失败分类
  HttpMcaClient.java           HTTP 实现：超时、信封解析、失败分类；非法 UUID 不发网络
  AssignmentResult.java        分配响应模型（assigned / join_target / reason）
  McaUnavailableException.java 携带分类的不可用异常
integration/                   真实 Velocity 联调探针（协议客户端 + 桩 MCA）
```

## 构建与测试

```bash
mvn -B package   # 产物 target/velocitygate-1.0.0.jar；velocity-plugin.json 由注解处理器生成
mvn test         # 30 例：路由路径 12、MCA 客户端 14、配置解析 4
```

## 路由机制

- 初始服务器固定为大厅（`lobby_server`），一切路由以大厅为基线；每个会话只查一次，断线清除标记，重连重新查询。
- 分配语义三形态（契约 1.10.0）：`assigned:true` + `join_target` → 转向映射命中的子服；`assigned:false`（无 reason）→ 静默留大厅（未绑定/无成局/已结算/过 TTL 的正常态）；`assigned:false` + `reason:no_room_available` → 留大厅并向玩家发可读原因。
- 房间层分工（契约 1.10.0）：本插件只消费 `join_target`；`room` 由子服上的 BedwarsRel-MCA 自行向 MCA 复核入房，代理不中转房间名。
- 所有失败路径的处置都是"留在大厅"——玩家永远不会卡在中间态。

## 失败分类（日志 `[分类]`）

`UNREACHABLE`（拒连/DNS）、`TIMEOUT`（超 `query_timeout_ms`）、`AUTH_REJECTED`（401/403，令牌非 OPS 级）、`NOT_FOUND`（404，几乎必是 `mca_base_url` 配错——服务端对未知 UUID 恒回 200）、`HRP_AUTH_DOWN`（502 `oauth_hrpauth_down`，与"未绑定用户"严格区分）、`HTTP_ERROR`（其余非 2xx）、`BAD_RESPONSE`（200 但信封不可解析）。

## 契约与验证边界

- 对外契约：HA-Contract `docs/api/openapi/matchcorearena-business.yaml`（assignment 端点 1.9.1、房间层 1.10.0）。
- 已验证：单元测试 30 例全绿；真实 Velocity 3.4.0 联调四场景（留大厅 / 转向 / no_room_available / 拒连分类）。尚未验证：真实 Minecraft 客户端（含 1.20.2+ 配置阶段）、真实 BedwarsRel 子服、生产 MCA 实例——首次上机仍需人工观察日志。
