---
title: Avalon
description: Avalon 单房间游戏服务器与零模组大厅模式：大厅为什么可以零模组、多装与少装模组的差异。
order: 1
tags:
  - game-server
  - lobby
  - cascade
updatedAt: 2026-11-08
---

# Avalon

Avalon 是单房间游戏服务器：每个实例运行一个房间，由自己的游戏引擎 helper 进程承载。多个 Avalon 实例挂在 [Cascade](../Cascade/index.md) 代理后面，其中一个被指定为零模组大厅。

本页讲大厅模式的机制；玩家侧的模组装配见 [RW-Mod-Injector](../RW-Mod-Injector/index.md)，跳转路由见 [Cascade](../Cascade/index.md)，服务器扩展见[插件三档](./plugins.md)。

## 大厅模式做什么

`cascadeLobby: true` 的后端（`internal/data/bean/configs.go::CoreConfig`）会启动引擎、建好房间、开放游戏端口、允许玩家连入停留——但永不真正开局（`internal/game/seam.go::StartGame` 的大厅分支），并拒绝客户端的 `/start` 命令（`internal/command/clientcommands.go::RegisterClientCommands`）。在 Cascade 侧，大厅被配置为默认后端，新连接一律落在大厅。

模组房同样以大厅模式运行：启动时只建房不开局，玩家进入之后才开局。这是所有后端的部署形态；结论与原因见 Avalon 仓 `docs/OPERATIONS.md`。

## 为什么零模组大厅行得通

引擎有两道互相独立的一致性门槛，只有一道与模组有关：

- **注册 checksum**——客户端注册时校验，只覆盖基础单位集；装了什么模组不会改变它。
- **自定义单位清单**——服务端在服务器信息包里下发自定义单位清单（名字 + 校验和），由客户端本地核对。缺模组或模组不一致会在这里失败，发生在进入大厅之前。

大厅后端的模组集为空，自定义单位清单因此为空，第二道门槛对任何客户端都平凡通过。任何客户端——没装模组、装了一些、装了任意模组——都能安全进入并停留。完整核查过程记录在 Avalon 仓 `knowledge/0009-zero-mod-lobby-and-mod-assembly.md`。

## 多装与少装

- **多装模组不影响任何事。** 注册不看模组，大厅的空自定义单位清单接纳所有人。
- **少装才是真正的门槛**：客户端缺某个必需模组时，连接模组房会在自定义单位核对处失败。这正是装配器要在连接发生之前解决的问题——见 [RW-Mod-Injector](../RW-Mod-Injector/index.md)。
- 装配时注入器按房间模组集精确匹配：启用房间要求的模组，其余模组在该会话中禁用。不删除任何文件。

## 相关

- [插件三档](./plugins.md)：Avalon 的进程外插件扩展模型
- [Cascade](../Cascade/index.md)：大厅之后的跳转路由
- [RW-Mod-Injector](../RW-Mod-Injector/index.md)：模组装配链路
- Avalon 仓 `docs/OPERATIONS.md`：配置面、大厅与路由、地图分发、故障对照
