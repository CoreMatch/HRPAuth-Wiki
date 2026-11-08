---
title: HASkinProxy 部署者文档
description: HASkinProxy 皮肤兼容代理的运行前提、从零部署、配置项表、端口、验证与故障对照。
order: 1
tags:
  - haskinproxy
  - deployment
updatedAt: 2026-11-08
---

# HASkinProxy — 部署

轻量代理：把 Yggdrasil API 逻辑转换为 CustomSkinLoader（CSL）兼容协议，衔接 Yggdrasil 兼容认证服务（如 HRPAuth + Yggdrasil API）与使用 CSL 的 Minecraft 客户端。转发的是标准 Yggdrasil 调用，因此兼容任何实现 Yggdrasil 协议的验证服务器。

## 运行前提

| 项 | 要求 |
|---|---|
| 构建 | Go（`go.mod` 1.26.10；README 写 1.24+，以 go.mod 为准） |
| 上游 | 必需：Yggdrasil 兼容服务（生态内为 HRPAuth，`deploy-manifest.yaml` 依赖 hrpauth required） |
| 凭据 | OAuth2 client_credentials 的 client_id / client_secret（与 HRPAuth 的 `service_clients` 种子同源） |
| 数据库 / Redis | 无（内存缓存 freecache） |
| 进程管理 | 面板管理（`manager: aapanel`，安装根 `/www/wwwroot/hasp`，二进制 `hasp`） |

版本号仓库未声明。

## 从零部署

```bash
go run main.go        # 首次运行在当前目录自动生成 config.yaml
# 编辑 config.yaml：upstream.base_url 与 client 凭据
go build -o build/hasp .   # 构建命令仓库未单独声明，产物路径按清单 artifact local_path
./build/hasp
```

容器：仓库提供 `Dockerfile` 与 `docker-entrypoint.sh`（环境变量渲染配置模板）。

## 配置项表

配置在 `config.yaml`（首启自动生成；无版本字段，清单 `template_version` 记为 unknown）。部署模板键值：

| 键 | 默认 | 作用 |
|---|---|---|
| `server.listen_addr` | ":2702" | 监听地址 |
| `server.public_url` | — | 外部可达基础 URL（作为 HRPAuth relay 的转发源） |
| `upstream.base_url` | — | HRPAuth 根地址；Yggdrasil 调用自动发往 `base_url + /yggdrasil-api` |
| `upstream.timeout` | 10 | 上游请求超时（秒） |
| `upstream.client_id` / `upstream.client_secret` | — | OAuth2 凭据。v14 语义"填什么就按什么"：填 super 凭据 → 启动时经 `POST /oauth/register` 换取本服务低权限客户端（client_id = presence 名 HASkinProxy）；填专用低权限对 → 只做幂等校验 |
| `cache.profile_ttl` | 3600 | 玩家信息缓存（秒） |
| `cache.texture_ttl` | 86400 | 材质缓存（秒） |
| `cache.max_size_mb` | 256 | 缓存上限（MB） |
| `presence.enabled` / `presence.name` / `presence.ttl_seconds` | true / HASkinProxy / 0 | presence 自报（0 = 永不过期） |
| `sdk.enabled` | true | SDK 包集成 |

配置重启生效；仓库未声明热加载机制。容器内配置由模板渲染，换取路径下写回不跨重启持久化（每次启动重新换取，HRPAuth get-or-create 保证 secret 稳定）。

## 端口与暴露面

| 端口 | 用途 | 暴露 |
|---|---|---|
| 2702 | 服务端口（游戏面，CSL 客户端访问） | 公网（`deploy-manifest.yaml` 声明 `exposure: public`） |

## 启动 / 停止 / 升级 / 回滚

- 生产为面板管理（`manager: aapanel`）：启停升级按面板操作；编排器只读。
- 非面板：直接运行二进制；停止 = SIGTERM。
- 无数据库、无迁移（`migration.mode: none`）、无数据目录；升级 = 替换二进制重启，回滚 = 换回旧二进制。

## 验证

```sh
curl -s http://127.0.0.1:2702/health
# 期望：200

curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:2702/ha_smoke_probe_zz9999
# 期望：404，响应体含 "user not found"（编排器冒烟同款：查无此人是正常 miss）

curl -s http://127.0.0.1:2702/<玩家名>
# CSL profile 查询；纹理走 /textures/{hash}
```

## 故障对照

| 现象 | 原因 | 处理 |
|---|---|---|
| profile 查询 404 "user not found" | 上游查无此玩家 | 正常 miss，不是故障 |
| 启动日志出现"种子跳过"类告警 | `client_secret` 填成了 super secret（HRPAuth 防呆：跳过种子条目） | 本服务会走自助注册拿独立 secret；或改用专用低权限凭据 |
| 上游请求超时 | `upstream.timeout`（默认 10s）内 HRPAuth 未应答 | 检查上游健康与网络 |
