---
title: HA-Services-MaintenanceView 开发者文档
description: 面板的代码结构、构建与测试、编排面代理契约、可用性判定与会话模型、数据形态。
order: 2
tags:
  - maintenanceview
  - development
updatedAt: 2026-11-08
---

# HA-Services-MaintenanceView — 开发

## 代码结构

```
main.go                              入口：装配配置、部署器客户端、状态存储与路由
internal/
  config/                            配置加载、保存、版本迁移
  models/                            Config、项目设置与远端项目模型
  cupbearer/client.go                 Cupbearer HTTP 客户端（10s 超时，解开信封 data；
                                     withAuth 时注入 X-Deploy-Token，未配置令牌拒绝发送）
  state/store.go                     本地 projects.json 读写
  server/
    router.go                        路由注册与静态文件回退（未知路径 → index.html）
    handlers.go / handlers_orchestration.go   请求处理器；编排面先过 manager 闸门再转发
    auth.go                          会话与登录（::authEnabled；会话 ID 进程内随机签发，12h 滑动过期）
    bootstrap_specs.go               首次配置引导的项目表
    bootstrap_runtime.go             运行二进制生成默认配置并改写 YAML
frontend/src/
  App.tsx                            外壳：导航、免登录警告徽标与横幅
  BootstrapView.tsx                  首次配置引导视图
  OrchestrationView.tsx              编排视图：项目状态、校验、运行进度、部署/回滚入口
  api.ts                             /api/* 调用封装与可用性判定（::isDeployable）
```

## 构建与测试

```bash
go build -o ./build/hasmv .          # 后端
go vet ./...
go test ./...

cd frontend
npm install
npm run build                        # 产物 frontend/dist
npm run dev                          # Vite 开发服务器 :5173，代理 /api 与 /healthz
```

本地真机对齐环境（真实 Cupbearer + 真实 Tinyvisor，全部回环、不碰生产）：按 `README.md` 的 "Local alignment environment" 一节搭建；验证口径是面板计数、`/api/orchestration/*` 返回与 Cupbearer 磁盘 `runs/*.json` 三方一致，dry-run 必须产生带 `dry-run:` 计划行的真实运行记录。

## 编排面代理与可用性判定

- 编排结构原样遵循 Cupbearer 的编排契约：`/api/orchestration/*` 一一映射 Cupbearer `/api/v1/deploy/*`（manifest / validation / status / runs / deploy / rollback）。
- 变更请求经服务端转发并注入 `X-Deploy-Token`（`internal/cupbearer/client.go`）；未配置令牌时拒绝发送，路由返回 503。
- 部署按钮可用性纯由清单声明决定（`frontend/src/api.ts::isDeployable`）：`manager: tinyvisor` 且 `kind` 非 `external`；面板管理、人工管理与 external 条目只读展示。无清单声明 = 编排区为空，浏览器端无兜底清单。
- 编排操作先经 manager 闸门再转发（`internal/server/handlers_orchestration.go`）。

## 首次配置引导

`bootstrap_specs.go` 登记三个项目：`hrpauth`（默认端口 2778）、`hrpauth-yggdrasil-api`（2770）、`haskinproxy`（2702）。引导流程：运行下载的二进制使其写出默认配置，再改写监听地址、自身 URL 字段与依赖 URL；名单外的项目在界面可见但不可初始化。

## 数据形态

- `data/projects.json`：本地部署设置（部署目录、端口），唯一持久化状态；无数据库、无迁移机制。
- 会话：进程内随机会话 ID，12 小时滑动过期；重启后会话失效。
- 静态回退：未命中路由按静态文件查 `frontend/dist`，回退 `index.html`——因此端点验证必须先核 `Content-Type`（回退是 `text/html`，真实端点是 `application/json`）。

## HTTP 接口

- `GET /healthz` · `GET /api/healthz`
- `GET /api/session` · `POST /api/session/login` · `POST /api/session/logout`
- `GET /api/config`（脱敏）
- `GET /api/projects` · `PUT /api/projects/:name/deployment` · `POST /api/projects/:name/precheck` · `POST /api/projects/:name/initialize`
- `GET /api/cupbearer/healthz` · `GET /api/cupbearer/manifest` · `GET /api/request-log`
- `GET /api/orchestration/manifest` · `validation` · `status` · `runs` · `runs/:id`
- `POST /api/orchestration/deploy` · `POST /api/orchestration/rollback`

会话中间件之后的路由在配置 `cupbearer.token` 时要求有效会话。
