---
title: HA-WebUI-SDKHandler 开发者文档
description: HA-WebUI-SDKHandler 的聚合构建管线、注入语义、HTTP 表面与已知缺陷。
order: 2
tags:
  - ha-webui-sdkhandler
  - development
updatedAt: 2026-11-12
---

# HA-WebUI-SDKHandler — 开发

WebUI 聚合构建服务（内部回环）：轮询 HRPAuth 的 SDK 源码头包，注入 HRPAuth-WebUI 前端模板，编译聚合前端，把静态产物发布到固定目录。无数据库、无 Redis；上游依赖仅 HRPAuth 核心。

## 代码结构

```
main.go              编排器：轮询触发 + runOnce（拉清单→测变化→下载→构建）+ execute（复制模板→注入→编译→发布）
internal/
  broker/            SDK 包拉取与变更检测
  build/             前端编译（运行期 node/npm/git）
  config/            配置加载（模板版本 4，SDKHANDLER_CONFIG 覆盖路径）
  inject/            注入：解包 SDK、校验 manifest、合并依赖、生成聚合文件
  publish/           发布：remove-then-rename 替换产物目录
  state/             构建状态记录
```

## 构建与测试

```bash
go build -o ./build/sdkhandler   # README 声明（Go 1.25+；go.mod 要求 1.26.10）
go vet ./...
go test ./...                    # 含 internal key 鉴权与静态托管两组端到端测试
```

运行期需要 `node`、`npm`、`git`（前端编译发生在服务运行时，不在构建期）；发布镜像已含。

## 管线语义

- **SDK 来源唯一**：只从 HRPAuth `GET /services/sdk-packages` 拉取（OAuth2 Bearer），下载后本地算 sha256（仓内 knowledge/0005）。
- **注入覆盖 `src/generated`**：每次构建全量执行——只读模板复制到 work 目录，SDK 包解压到 `src/generated/services/<name>/`，校验 manifest、合并 dependencies，生成 `sdk-manifest.ts` 与 `sdk-routes.tsx`（routes 转 React lazy route）（仓内 knowledge/0002、`internal/inject/`）。
- **发布非原子**：固定产物目录，remove-then-rename 替换，删除与改名之间存在已知服务间隙（仓内 knowledge/0004）。
- 构建策略偏差（构建工具链与模板假设）见仓内 knowledge/0003；state 包未跟踪缺陷见 knowledge/0006。

## HTTP 表面与鉴权

- `:2704`（API）：`GET /health`（免鉴权）、`GET /api/build/status`、`POST /api/build/trigger`、`GET /api/revision`——`/api/*` 一律 `X-Internal-Key` 防护，key 未配置时全部 401（fail-closed）；非 `/api` 路径托管静态产物（根路径 `index.html`，SPA fallback）。
- `:2705`：维护操作。
- 部署默认仅回环绑定；健康探针 `GET /health`（`:2704`）。

## 契约

- 对外契约：HA-Contract `docs/api/openapi/webui-sdkhandler.yaml`。
- SDK 包格式与聚合管线：HA-Contract `docs/dev/HRPAuth/sdk-package.md`；微服务扩展层（presence / sdk-packages）：`docs/dev/HRPAuth/microservices.md`。
