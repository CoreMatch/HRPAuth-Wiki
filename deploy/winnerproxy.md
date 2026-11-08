---
title: WinnerProxy 部署者文档
description: WinnerProxy 加入代理的运行前提、从零部署、配置项表、端口、验证与故障对照。
order: 1
tags:
  - winnerproxy
  - deployment
updatedAt: 2026-11-08
---

# WinnerProxy — 部署

HA-Contract 的代理服务组件：Mojang 玩家的加入代理，按账号来源分发请求，保留稳定 UUID。

## 运行前提

| 项 | 要求 |
|---|---|
| 构建 | Go（`go.mod` 1.26.10） |
| 依赖服务 | 必需：HRPAuth（启动期凭据换取/校验）与 HRPAuth-Yggdrasil-API（上游转发）——`deploy-manifest.yaml` 均声明 required |
| 数据库 / Redis | 无（内存缓存） |
| 进程管理 | 面板管理（`manager: aapanel`，安装根 `/www/wwwroot/wp`，二进制 `winnerproxy`） |

清单声明的服务版本为 `0.2.0`。

## 从零部署

```bash
go run .              # 首次启动在工作目录自动生成 config.yml，默认监听 :2777
# 编辑 config.yml：hrpauth.url、凭据、upstreams.hrpauth.url
go build -o build/winnerproxy .   # 构建命令仓库未单独声明，产物路径按清单 artifact local_path
./build/winnerproxy
```

容器：仓库提供 `Dockerfile` 与 `docker-entrypoint.sh`。

## 配置项表

配置在工作目录 `config.yml`（首启自动生成；模板版本 2）。部署模板键值：

| 键 | 默认 | 作用 |
|---|---|---|
| `version` | "2" | 配置模板版本 |
| `server.addr` | ":2777" | 监听地址 |
| `server.public_url` | — | 对外地址 |
| `server.read_timeout_sec` / `write_timeout_sec` | 15 / 15 | 读写超时 |
| `log.level` / `log.format` | info / text | 日志 |
| `cache.size` | 104857600 | 内存缓存大小（字节，约 100MB） |
| `cache.ttl_sec` | 300 | 缓存 TTL |
| `hrpauth.url` | — | HRPAuth 地址（凭据换取/校验） |
| `hrpauth.client_id` / `client_secret` | — | v14 语义"填什么就按什么"：填 super 凭据 → 启动时经 `POST /oauth/register` 换取本服务低权限客户端（client_id = presence 名 WinnerProxy，super 凭据只用那一次）；填专用低权限对 → 只做幂等校验（client_credentials 令牌请求） |
| `hrpauth.presence.enabled` / `name` / `ttl_seconds` | true / WinnerProxy / 0 | presence 自报（0 = 永不过期） |
| `hrpauth.sdk.enabled` | true | SDK 集成 |
| `upstreams.official.url` | https://api.minecraftservices.com | Mojang 官方上游 |
| `upstreams.official.timeout_sec` / `enabled` | 10 / true | 官方上游超时与开关 |
| `upstreams.hrpauth.url` | — | HRPAuth-Yggdrasil-API 上游地址 |
| `upstreams.hrpauth.client_id` / `client_secret` / `timeout_sec` / `enabled` | 与 hrpauth 段同一对变量 / 10 / true | Yggdrasil 上游 |
| `site.name` / `site.version` | WinnerProxy / "0.2.0" | 站点自报（version 带引号防 YAML 解析坑） |

配置重启生效；仓库未声明热加载机制。容器部署时配置为启动渲染的一次性文件，换取成功后的写回不跨重启持久化（每次启动重新换取，HRPAuth get-or-create 保证 secret 稳定）。

## 端口与暴露面

| 端口 | 用途 | 暴露 |
|---|---|---|
| 2777 | 服务端口（游戏面） | 公网（`deploy-manifest.yaml` 声明 `exposure: public`） |

## 启动 / 停止 / 升级 / 回滚

- 生产为面板管理（`manager: aapanel`）：启停升级按面板操作；编排器只读。
- 非面板：直接运行二进制；停止 = SIGTERM。
- 无数据库、无迁移（`migration.mode: none`）、无数据目录；升级 = 替换二进制重启，回滚 = 换回旧二进制。

## 验证

```sh
curl -s http://127.0.0.1:2777/health
# 期望：200

curl -s -o /dev/null -w "%{http_code}\n" \
  "http://127.0.0.1:2777/sessionserver/session/minecraft/hasJoined?username=ha_smoke_probe_zz9999&server=ha-smoke"
# 期望：204（编排器冒烟同款：探针用户无会话）
```

## 故障对照

| 现象 | 原因 | 处理 |
|---|---|---|
| Mojang 玩家验证不走官方上游 | `upstreams.official.enabled` 关闭 | 按部署形态决定开关；Mojang upstream 仅在 hasJoined 阶段使用 |
| 启动日志出现"种子跳过"类告警 | `client_secret` 填成了 super secret（HRPAuth 防呆） | 本服务走自助注册拿独立 secret，或修正凭据 |
| 上游转发失败 | `upstreams.hrpauth` 不可达 | 检查 HRPAuth-Yggdrasil-API 健康 |
