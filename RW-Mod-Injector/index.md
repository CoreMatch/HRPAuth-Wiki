---
title: RW-Mod-Injector
description: 客户端模组装配器：/inj 命令、装配链路、失败时玩家看到的提示、/inj restore 还原。
order: 1
tags:
  - client
  - mods
  - assembly
updatedAt: 2026-11-08
---

# RW-Mod-Injector

模组房间要求一组特定的模组。RW-Mod-Injector 是注入游戏客户端的装配器：精确拉取这组模组、完成安装并把玩家带进房间——之后还能把客户端还原回原样。本页先讲玩家会看到什么，再讲整条链路的机制。

## 玩家视角

### 一次性安装

安装器把注入器放到游戏目录旁，并生成一个包装启动脚本；此后玩家通过这个脚本启动游戏。不修改任何游戏文件，也不需要任何玩家凭据——进房走的仍是游戏自己的连接。

### 命令

| 命令 | 作用 |
|---|---|
| `/inj join <房间码>` | 装配该房间所需模组并进入 |
| `/inj restore` | 恢复到上次装配前的模组状态 |
| `/inj status` | 查看注入器当前状态 |
| `/inj help` | 查看帮助 |

这些命令在客户端聊天层被拦截（`Commands.java::tryHandle`），不会发往服务器。进度以系统消息播报：拉取清单、下载、安装、离房、应用模组集、热重载、重连，最后跳入目标房间。

### 失败时看到什么

每类失败都有一条面向玩家的提示，包含结论与下一步；技术细节（URL、哈希、堆栈）只进日志。分类入口在 `Assembler.java::friendlyFailure`。

| 失败类别 | 游戏内提示（英文原文） | 下一步 |
|---|---|---|
| 清单拉不到 | "Couldn't fetch the mod list for this room (control server unreachable?). You stayed in the lobby - try /inj join again in a moment." | 稍后重试 `/inj join` |
| 哈希不符 | "Security check failed: a mod file did not match the room manifest and was NOT installed. The room's mod pack may be corrupted - tell the server operator." | 告知运营；该文件绝不重试 |
| 下载截断 | "A mod download arrived incomplete. You stayed in the lobby - try /inj join again." | 重试 `/inj join` |
| 模组目录不可写 | "Can't write to the mod folder (permissions or disk full?). Fix it and try /inj join again." | 修权限或磁盘后重试 |
| 模组包过大 | "The room's mod pack is too large to install. Tell the server operator." | 告知运营 |
| 包损坏 | "A mod file is corrupt and was NOT installed. The room's mod pack may be broken - tell the server operator." | 告知运营 |
| 下载失败 | "Downloading a mod file failed (server problem). You stayed in the lobby - try /inj join again." | 重试 `/inj join` |
| 未连大厅 | "Connect to the lobby first, then use /inj join \<room code\>." | 先连大厅 |
| 重载失败 | "Applying the mod set failed during the unit reload. Your previous mod set was restored - if the game misbehaves, restart it." | 重启游戏 |
| 重连失败 | "Mods are applied, but reconnecting to the lobby failed - please reconnect manually." | 手动重连 |

装配失败绝不会把客户端留在半装配状态：玩家留在（或被送回）大厅，临时文件全部清理。

### 恢复装配前的状态

`/inj restore` 回放到装配前拍下的快照：原有模组回到之前的启用/禁用状态，本次装配新装的模组一律禁用，恢复完成后清空快照。恢复过程与装配相同：先离房、主菜态重载、再重连。

## 链路机制

### 清单与内容端点

房间模组集的权威来源是对应 Avalon 子服 `data/mods` 目录的内容。Avalon 枚举该目录并通过控制面提供两个只读端点（`internal/net/gateway/mods.go::handleRoomMods`、`internal/net/gateway/mods.go::handleRoomModFile`）：

- `GET /v1/rooms/{code}/mods`——清单：每个模组的安全文件名、SHA-256、大小（`internal/game/manage/modmanifest.go`）
- `GET /v1/rooms/{code}/mods/{file}`——模组文件字节；文件名必须命中清单，否则 404

### 对账只认内容哈希

SHA-256 是唯一判定标准。已安装文件逐个计算哈希与清单比对：内容命中即视为已具备，与文件名无关。缺失条目下载到临时文件，先校验大小、再校验哈希，通过后才改名进入已校验缓存。哈希不符直接删除临时文件且绝不重试——内容不可信。

### 物化与重载

引擎只从模组目录装载目录型模组，因此校验过的 zip 会被解压到那里（带 zip-slip 防护，先解压进临时目录再原子改名就位）。在此之前，装配器先对当前全部已装模组的启用态拍快照——`/inj restore` 恢复的就是这份快照。

多人会话活跃时引擎拒绝重载单位，且服务端持续核对客户端的单位注册表。因此装配的顺序是：干净离房 → 在主菜态热重载（`Engine.java::reloadUnits`）→ 重连大厅 → 才发 `/goto <房间码>`（直连模式下直接连目标）。整条流程的入口是 `Assembler.java::assembleAndJoin`。

## 配置

注入器读取 jar 同目录的 `rw-mod-injector.properties`（`Config.java::load`）：

- `control.url`——房间控制面的基础 URL
- `mode`——`cascade`（经代理跳转）或 `direct`（直连）
- `direct.target`——直连模式的目标地址

## 边界

- 只认内容哈希；签名机制尚未启用（清单已预留字段）。
- 任何环节都没有凭据：不进注入器，不进清单。
- 不修改客户端游戏文件，不触碰引擎的 kick/校验逻辑。
- 单模组与单次装配总量设上限，超限拒绝。

## 相关

- [回归脚本](./regression.md)：端到端测试，覆盖整条链路与失败路径
- [Avalon](../Avalon/deployment.md)：装配从哪里开始（零模组大厅）
- [Cascade](../Cascade/index.md)：装配完成后的跳转路由
- RW-Mod-Injector 仓 `knowledge/0001-injector-design.md` 与 `knowledge/0002-failure-messaging.md`：设计决策与完整失败文案表
