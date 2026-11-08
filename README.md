# HRPAuth-Wiki

项目生态的 Wiki：每个服务现在怎么部署、怎么开发。每个项目两条并列文档——部署者与开发者。

## 项目清单

### Avalon

Rusted Warfare（铁锈战争）游戏服务端（目标客户端 1.15 / 协议号 176）：Go 运行时主体 + 外置 Java 引擎壳（helper）。可独立运行（分发包，带 helper 可开局），也可作为 Cascade 代理的后端；当前部署清单声明的是无 helper 形态（能启动、能进房、不能开局）。版本号仓库未声明。

- [部署者文档](./Avalon/deployment.md)
- [开发者文档](./Avalon/development.md)

### Cascade

RW 边缘反向代理：玩家唯一公网入口，房间目录、会话路由、`/goto` 跳服（跳转目标恒为代理自己的跳转端口，子服不暴露公网）。版本号仓库未声明。

- [部署者文档](./Cascade/deployment.md)
- [开发者文档](./Cascade/development.md)

### RW-Mod-Injector

注入游戏客户端的模组装配器：进房前按房间清单拉取、校验（SHA-256）并装配模组，`/inj restore` 还原装配前状态。当前为单页文档，部署者/开发者拆分待补。

- [文档](./RW-Mod-Injector/index.md)
- [回归脚本](./RW-Mod-Injector/regression.md)

### HA-Services-Deployer

版本清单与产物分发后端；可选启用为裸金属/容器部署编排器（前置检查、版本目录 + `current` 软链切换、经 Tinyvisor 重启、健康与冒烟、按镜像摘要回滚）。纯本地文件服务，无数据库。版本号仓库未声明。

- [部署者文档](./HA-Services-Deployer/deployment.md)
- [开发者文档](./HA-Services-Deployer/development.md)

### HA-Services-MaintenanceView

浏览器运维面板：展示编排器的清单聚合、校验、状态与运行记录，触发部署/回滚；部署凭据由服务端持有。当前为单页文档，部署者/开发者拆分待补。

- [文档](./HA-Services-MaintenanceView/index.md)
