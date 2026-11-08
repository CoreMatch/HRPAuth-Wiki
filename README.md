# HRPAuth-Wiki

项目生态的 Wiki：按项目分层的纯 Markdown 文档，无站点生成器（见 [knowledge/0001](./knowledge/0001-plain-markdown-content-repo.md)）。

## 游戏服务栈（现状文档）

面向 Rusted Warfare 游戏服务栈的现状文档，三类读者各有入口：

- **玩家**：[RW-Mod-Injector](./RW-Mod-Injector/index.md)——模组装配命令、失败时看到什么、`/inj restore`；[Cascade](./Cascade/index.md)——大厅与 `/goto` 跳转。
- **维护者**：[HA-Services-Deployer](./HA-Services-Deployer/index.md)——部署编排；[HA-Services-MaintenanceView](./HA-Services-MaintenanceView/index.md)——运维面板；[RW-Mod-Injector 回归脚本](./RW-Mod-Injector/regression.md)；[Avalon](./Avalon/index.md) 的大厅拓扑同样与部署相关。
- **插件作者**：[Avalon 插件三档](./Avalon/plugins.md)；完整开发者文档在 Avalon 仓 `docs/plugins/`。

一局游戏的串联：客户端连 [Cascade](./Cascade/index.md) 代理进入零模组大厅 → 选择模组房 → [RW-Mod-Injector](./RW-Mod-Injector/index.md) 装配该房间的模组集 → `/goto` 经代理跳入子服 → 对局结束后 `/inj restore` 还原。

## 冻结快照（2026-10 拆分前后）

以下目录冻结于服务拆分前后，只作历史参考，不随代码更新（见 [knowledge/0002](./knowledge/0002-content-frozen-before-service-split.md)）：

- [HRPAuth](./HRPAuth/index.md)
- [HASkinProxy](./HASkinProxy/index.md)
- [WinnerProxy](./WinnerProxy/index.md)

## 决策记录

[knowledge/](./knowledge/README.md) 记录本仓自己的决策：为什么这么定、当时排除了什么。外部行为以 [HA-Contract](https://github.com/CoreMatch/HA-Contract) 为准。
