# 部署者轨道

面向部署、配置与运维服务的人。每个项目一页：运行前提、从零部署、配置项表、端口与暴露面、启动/停止/升级/回滚、验证、故障对照。

- [Avalon](./avalon.md)——游戏服务端（独立分发包形态与 Cascade 后端形态）
- [Cascade](./cascade.md)——边缘反向代理（玩家唯一公网入口）
- [RW-Mod-Injector](./rw-mod-injector.md)——玩家使用：安装、`/inj` 命令、失败提示、回退与卸载
- [HA-Cupbearer](./ha-cupbearer.md)——清单分发后端与部署编排器：裸金属编排是主线，容器路径一键触发，另有已实现的容器级管理能力
- [Grail](./grail.md)——产物分发上游（原站 + 分级镜像）：三渠道签名发布、规范取件 URL、只拉式同步、撤销与宽限期
- [HA-Services-MaintenanceView](./ha-services-maintenanceview.md)——浏览器运维面板
- [HRPAuth](./hrpauth.md)——认证核心与 OAuth2 授权中心
- [HASkinProxy](./haskinproxy.md)——Yggdrasil → CustomSkinLoader 兼容代理
- [WinnerProxy](./winnerproxy.md)——Mojang 玩家保留 UUID 的加入代理
- [MatchCoreArena-Server](./matchcorearena-server.md)——竞技平台匹配与结算核心（Go/Gin 独立服务）
- [MatchCoreArena-VelocityGate](./matchcorearena-velocitygate.md)——Velocity 代理插件：已成局玩家路由进游戏服（装进 Velocity，非独立进程）
- [MatchCoreArena-Client](./matchcorearena-client.md)——玩家桌面客户端（无分发包，源码构建路径）
- [BedwarsRel-MCA](./bedwarsrel-mca.md)——游戏侧上报插件：安装、match-reporting 配置、上报验证
- [HRPAuth-Yggdrasil-API](./hrpauth-yggdrasil-api.md)——Yggdrasil 兼容认证服务（authlib-injector 可直连）
- [HASkinLib](./haskinlib.md)——皮肤库服务（纹理上传/预览/拉取）
- [HA-WebUI-SDKHandler](./ha-webui-sdkhandler.md)——WebUI 聚合构建服务（内部回环）
