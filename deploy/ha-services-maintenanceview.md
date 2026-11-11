---
title: HA-Services-MaintenanceView 部署者文档
description: 运维面板的运行前提、从零部署、配置项表、端口、启停升级、验证与故障对照。
order: 1
tags:
  - maintenanceview
  - deployment
updatedAt: 2026-11-11
---

# HA-Services-MaintenanceView — 部署

浏览器运维面板：托管前端、代理 HA-Cupbearer（含编排面），并提供部署/回滚入口与首次配置引导。无数据库，状态落在本地 JSON。

## 运行前提

| 项 | 要求 |
|---|---|
| 构建 | 后端 Go 1.25.0+（`go.mod`）；前端 Node.js + npm |
| 运行时 | 编译后的后端二进制 + 已构建的前端（`frontend/dist`）；目录缺失时服务返回 503 并提示先构建前端 |
| 依赖服务 | 必需：HA-Cupbearer（`cupbearer.base_url`，必须先启动，见其[部署者文档](./ha-cupbearer.md)） |
| 数据库 / Redis | 无 |
| 进程管理 | 生产为面板管理（`deploy-manifest.yaml` 声明 `manager: aapanel`，安装根 `/www/wwwroot/hasmv`，生产实测在位） |

版本号仓库未声明（无版本 tag，代码与配置均无服务版本字段）。

## 从零部署

```sh
go build -o ./build/hasmv .
cd frontend && npm install && npm run build && cd ..
cp config.example.yaml config.yaml
# 编辑 config.yaml：cupbearer.base_url、cupbearer.token
./build/hasmv            # 或 go run .
```

- `config.yaml` 不存在时启动写入默认配置；版本较旧时按链式规则逐版迁移。
- 打开 `http://127.0.0.1:2771`（端口随 `server.listen`）。
- 容器：镜像已发布到 Docker Hub——`limeight/ha-services-maintenance-view`（`linux/amd64` + `linux/arm64` 多架构，tag `4567105` 并列 `latest`，生效引用钉 manifest list digest `sha256:52ee8d3d1a0af9695f815870b0f25ecbef2e9141c8e65735585750ed414b908a`；前端已内嵌构建）。容器模板端口 `:18081`，与裸金属默认端口不一致（见下表）。

## 配置项表

配置在 `config.yaml`，启动时读取；仓库未声明热加载机制，改动重启生效。

| 键 | 类型 | 默认 | 作用 |
|---|---|---|---|
| `version` | string | "1" | 配置结构版本 |
| `server.listen` | string | `:2771` | 监听地址 |
| `server.public_base_url` | string | `http://127.0.0.1:2771` | 浏览器访问本服务使用的地址 |
| `server.frontend_dist` | string | `./frontend/dist` | 前端构建产物目录；缺失返回 503 |
| `cupbearer.base_url` | string | `http://127.0.0.1:18080` | Cupbearer 地址 |
| `cupbearer.token` | string | "" | Cupbearer 部署令牌，同时作为面板登录密码；留空 = 免登录模式，部署/回滚触发返回 503 |
| `state.projects_path` | string | `./data/projects.json` | 本地部署设置文件 |

初始化端口规则：端口必须落在 1–65535 且在全部项目间唯一（覆盖本地已保存项目与 Cupbearer 上报项目）。

## 端口与暴露面

| 端口 | 场景 | 暴露 |
|---|---|---|
| `:2771` | 裸金属生产（代码默认与 `config.example.yaml` 一致，生产实测 `/healthz` 200） | 仅回环（`deploy-manifest.yaml` 声明 `exposure: loopback`）；面板无内置鉴权面时优先 SSH 隧道而不是暴露 |
| `:18081` | 容器模板（Dockerfile） | 容器场景；与裸金属端口不一致已在该仓 knowledge 记录 |
| `:5173` | 前端 Vite 开发服务器（仅开发） | 开发机；代理 `/api` 与 `/healthz` 到后端（开发时后端须跑在 `:18081`） |

## 启动 / 停止 / 升级 / 回滚

- 生产：面板管理（`manager: aapanel`），启停升级按面板操作；编排器视其为外部项目，只读不碰。
- 非面板：直接运行二进制；停止 = SIGTERM。
- 升级：替换二进制与 `frontend/dist`（静态资产在位 `/www/wwwroot/hasmv/frontend/`），重启。
- 回滚：换回旧二进制与旧前端产物；无数据库，无 schema 顾虑。

## 验证

```sh
curl -s http://127.0.0.1:2771/healthz
# 期望：200

curl -s -D- http://127.0.0.1:2771/api/session
# 期望：200，Content-Type: application/json，响应含 data.auth_required
# 注意：本服务对未知路径一律回 200 + index.html（SPA 静态回退），
# 验证端点必须先看 Content-Type 是否为 application/json，再看字段
```

配置了 `cupbearer.token` 时：用该令牌登录面板，编排区应显示 Cupbearer 聚合出的项目清单；对面板数据的抽查口径是三方一致——面板计数、`/api/orchestration/*` 返回、Cupbearer `state_dir/runs/*.json` 磁盘记录。

## 登录与凭据

- 单凭据模型：登录密码**就是** `cupbearer.token`（`internal/server/auth.go::authEnabled` 决定 `auth_required`），没有独立账号体系。
- 令牌由服务端持有：代理变更请求时注入（`internal/cupbearer/client.go`），浏览器永远拿不到；`GET /api/config` 已脱敏，任何端点不返回令牌内容。
- 未配置令牌：免登录模式**显式宣告**——页头警告徽标 + 横幅说明只读视图可用、部署/回滚将被 503 拒绝（fail-closed，与 Cupbearer 一致）。

## 故障对照

| 现象 | 原因 | 处理 |
|---|---|---|
| 服务起不来/返回 503 提示构建前端 | `server.frontend_dist` 目录缺失 | `cd frontend && npm install && npm run build` |
| 部署/回滚返回 503 | `cupbearer.token` 未配置（面板与 Cupbearer 双重 fail-closed） | 配置令牌（与 Cupbearer 凭据文件 `deploy_token` 同值）后重启 |
| 编排区为空 | Cupbearer 未聚合到任何 `deploy-manifest.yaml` | 检查 Cupbearer 的 `scan_roots`/`external_manifests` |
| 编排区警告横幅 | 清单装载错误（原文显示，不被隐藏） | 按横幅内容修清单 |
| 项目无部署按钮 | 清单未声明 `manager: tinyvisor`，或 `kind: external` | 面板管理/人工管理/外部项目本就只读，属预期 |
| 保存部署设置报端口错误 | 端口超出 1–65535 或与已有项目重复 | 换端口 |
