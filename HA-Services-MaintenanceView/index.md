---
title: HA-Services-MaintenanceView
description: 运维面板：能看到什么、能做什么、界面可用性与 deploy-manifest 声明同源、登录与凭据模型。
order: 1
tags:
  - ops
  - panel
  - dashboard
updatedAt: 2026-11-08
---

# HA-Services-MaintenanceView（运维面板）

HA Services MaintenanceView 是这套服务栈的浏览器运维面板：展示 Deployer 掌握的情况，并能触发部署与回滚。面板展示的一切来自各项目的清单声明，浏览器端不发明任何内容。

## 能看到什么

- **项目列表**——Deployer 扫描聚合出的 `deploy-manifest.yaml` 声明，原样呈现。清单装载错误以警告横幅原文显示，不被隐藏。
- **校验结果**——聚合校验报告，包括项目重名警告与全部重复路径。
- **状态**——逐项目的声明态与实际态：已装版本、`current` 指向、进程健康、可达性。
- **运行记录**——每次部署与回滚的逐项目、逐步骤进度与结果（已部署、已是最新、已回滚、失败、dry-run、外部、跳过），以及该次运行的前置检查报告。

## 能做什么

- 在编排区发起**部署**与**回滚**（含 dry-run）；面板把请求转发给 Deployer，由 Deployer 过前置检查门并执行。一次运行具体做什么见 [HA-Services-Deployer](../HA-Services-Deployer/index.md)。
- 对少数已知服务做**首次配置引导**：运行一次下载的二进制生成默认配置，再改写监听地址与跨服务 URL。

## 可用性与 Manifest 同源

哪些项目有部署按钮，完全由清单声明决定（`frontend/src/api.ts::isDeployable`）：项目声明由 Tinyvisor 管理进程、且种类不是 external，才算可部署。面板管理、人工管理与 external 条目作为只读事实展示。没有任何清单声明 = 编排区为空——面板没有浏览器端的兜底清单。

## 登录与凭据

- 面板复用现有运维身份：登录密码**就是** Deployer 部署令牌（`internal/server/auth.go::authEnabled`）。没有独立的账号体系。
- 部署凭据由服务端持有。面板后端把令牌注入转发的变更请求（`internal/deployer/client.go`）；任何端点都不返回令牌内容，配置端点做了脱敏。
- 未配置令牌时，面板保持免登录模式——且是显式宣告的：页头显示警告徽标，只读视图可用，部署/回滚返回 503（fail-closed），与 Deployer 自身行为一致。

## 相关

- [HA-Services-Deployer](../HA-Services-Deployer/index.md)：面板代理的后端，部署与回滚的实际执行者
