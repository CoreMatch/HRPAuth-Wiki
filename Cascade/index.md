---
title: Cascade
description: Cascade 公网代理：房间目录、/goto 跳转、子服不暴露公网、房间快照与健康门控。
order: 1
tags:
  - proxy
  - routing
  - cascade
updatedAt: 2026-11-08
---

# Cascade

Cascade 是面向公网的代理：玩家只连接它一次，由它把玩家路由到后端、提供房间目录、处理跳服。各后端是 [Avalon](../Avalon/deployment.md) 单房间实例，其中一个被指定为零模组大厅（默认后端）。

## 路由：从大厅到子服

1. 玩家在大厅聊天框输入 `/goto <房间码>`。这是 Cascade 代理的命令，不是 Avalon 的命令。
2. Cascade 把房间码解析到所属后端（`internal/proxy/session.go::commandGoto`）。
3. Cascade 回一个重连包，目标是 `PublicGameHost:<jump_port>`——**代理自己的**跳转监听端口，从不是后端的真实地址。
4. 客户端重连到跳转端口；跳转监听器把这条连接直通到对应后端（`internal/proxy/server.go::Run`）。

由此得到：

- **子服不暴露公网。** 后端游戏口只需对 Cascade 可达；任何报文里的跳转目标恒为代理入口。后端在 Cascade 配置里声明 `jump_port`（`internal/config/config.go::BackendConfig`），代理为每个这样的后端多开一个公网监听端口。
- `PublicGameHost` 留空 = 禁用跳转（`/goto` 回复跳转未启用）。
- 玩家浏览的房间目录来自 Cascade 对各后端控制面的快照，持续刷新。

## 启动窗口：给自动化的提示

Cascade 要求连续两次探测成功才把后端判为健康，而房间快照一次成功就对外可见。后端刚启动时存在"房间已可见、后端还未健康"的窗口；只等房间出现就放客户端进来的自动化会被 "No available backend" 踢回。门控要等后端健康，而不是等房间出现。

## 相关

- [Avalon](../Avalon/deployment.md)：零模组大厅为什么行得通、大厅模式做什么
- [RW-Mod-Injector](../RW-Mod-Injector/index.md)：装配完成后经 `/goto` 进入模组房
- Cascade 仓 `knowledge/`：代理设计记录，含跳转路由
