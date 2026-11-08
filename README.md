# HRPAuth-Wiki

项目生态的 Wiki：每个服务现在怎么部署、怎么开发。先选择身份进入对应轨道——两条轨道的文档互不同时出现。

## 选择身份

- **[我是部署者](./deploy/index.md)**——面向要把服务部署、配置、运维起来的人：运行前提、从零部署的命令、配置项表、端口与暴露面、启动/停止/升级/回滚、部署验证、故障对照。
- **[我是开发者](./dev/index.md)**——面向要改代码、写扩展的人：代码结构、构建与测试、扩展点与契约、数据形态与兼容规则。

## 项目清单

- **Avalon**——Rusted Warfare 游戏服务端：Go 运行时主体 + 外置 Java 引擎壳（helper）。
- **Cascade**——RW 边缘反向代理：玩家唯一公网入口，房间目录、会话路由、`/goto` 跳服。
- **RW-Mod-Injector**——客户端模组装配器：进房前装配房间模组集，SHA-256 校验，`/inj restore` 还原。
- **HA-Services-Deployer**——版本清单与产物分发后端；可选启用为裸金属/容器部署编排器。
- **HA-Services-MaintenanceView**——浏览器运维面板：编排状态、部署与回滚入口。
- **HRPAuth**——认证服务（OAuth2 与 Yggdrasil 兼容接口）。
- **HASkinProxy**——皮肤兼容性代理（Yggdrasil → CustomSkinLoader）。
- **WinnerProxy**——Mojang 玩家保留 UUID 的加入代理。
- **MatchCoreArena-Server**——竞技平台匹配与结算核心：Go/Gin 独立 HTTP 服务，匹配排队成局、加权 Elo 结算、排行榜。
- **MatchCoreArena-Client**——玩家桌面客户端（Wails）：登录、匹配排队、战绩与排行榜只读展示；当前无分发包，从源码构建。
- **BedwarsRel-MCA**——BedwarsRel 的 fork（玩法全上游）：对局结束时把结果上报给 MatchCoreArena-Server 结算；仅支持 MC 1.8.x/1.12。
