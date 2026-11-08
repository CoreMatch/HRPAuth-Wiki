---
title: HA-Services-Deployer
description: 部署编排：deploy-manifest 双层模型、裸金属与容器两种运行时、回滚语义、前置检查、凭据与鉴权。
order: 1
tags:
  - deployment
  - orchestration
  - ops
updatedAt: 2026-11-08
---

# HA-Services-Deployer（部署编排）

HA Services Deployer 是这套服务栈的部署执行者：版本清单、产物分发，以及可选启用的编排。每个项目用一份清单声明自己；Deployer 校验产物、切换版本、经 Tinyvisor 重启进程、探测健康并回滚。

## 清单模型

每个项目仓库根目录一份 `deploy-manifest.yaml`，分为两层：

- **运行时无关事实**——项目是什么：端口与暴露面、健康探测、可选的部署后冒烟断言、依赖、数据目录、配置文件。两种运行时复用同一份事实。
- **运行时执行方式**——项目怎么跑：`baremetal` 段与 `container` 段。顶层 `runtime` 选择器按项目二选一（默认 `baremetal`）；部署上下文覆盖（Deployer 配置的 `orchestration.overrides.<项目>.runtime`）可以在不改清单的情况下切换。其它取值在校验时即被拒绝。

Deployer 扫描配置的目录根聚合清单并做聚合校验。项目重名（例如并行 worktree 的副本）默认不阻断：以警告形式列出全部重复路径，按扫描根顺序取第一个作为生效项目。配置开关 `orchestration.strict_project_names` 可在需要严格时把重名升级为拒绝运行。

## 裸金属运行时

裸金属流程（`internal/orchestrator/pipeline.go`）：

1. 产物暂存并校验（SHA-256 强制）。
2. 安装进项目 `releases/` 树下以版本命名的目录。
3. 原子切换 `current` 软链（临时链接 + rename，`internal/orchestrator/pipeline.go::switchSymlink`）。
4. 注册到 Tinyvisor 的启动脚本以 `./current/<binary>` 为入口，因此软链切换 + 重启就是版本生效。声明为共享的数据目录在版本目录之外，升级不触碰。
5. Deployer 经 Tinyvisor 重启会话，等待健康探测；清单声明了冒烟断言的，还要跑真实请求。冒烟失败 = 部署失败，走同样的自动回滚。

关键语义：

- **生效 = 软链切换 + 重启 + 健康。** 只搬文件不算部署。
- **幂等重跑 = 续跑。** 运行记录逐项目记录进度，重跑从断点继续，已健康的目标报"已是最新"。
- **失败隔离**：按依赖拓扑序部署；单个项目失败不损坏其它项目，运行记录可供追查。
- **进程归 Tinyvisor。** Deployer 不做守护进程管理：不写 systemd，不自己持有进程。

## 容器运行时

`runtime: container` 时镜像即版本（`<项目名>:<service_version>`），版本切换 = 同名容器重建，监督由容器重启策略负责。容器项目不触碰 Tinyvisor。健康探测与冒烟断言打在发布的宿主端口上，语义不变。带编排器标签但已不在任何清单中的孤儿容器**默认只报不删**，除非孤儿策略显式设为删除。

## 回滚语义

- **裸金属**：回滚把 `current` 切回上一版本目录并重启。
- **容器**：回滚按运行记录中登记的**镜像摘要**钉死，绝不按标签。标签是可移动的引用——重打一次标签就会让按标签回滚静默落到另一份内容上。若记录摘要对应的镜像已不存在，回滚明确拒绝；没有退回按标签定位、也没有"找个近似镜像顶上"的路径。恢复手段是重新部署该版本，记下新摘要后回滚能力恢复。

## 前置检查

每次部署与回滚开局先过一次性的前置检查（`internal/orchestrator/preflight.go`）：安装根目录与软链可写、env 文件、密钥可解析、Tinyvisor 可达且密钥有效、端口占用（跳过项目自身进程）、磁盘空间、依赖可达。阻断项直接拒绝运行并附完整分级报告；警告项放行。每条都带具体路径或端口。dry-run 同样过门，并把报告与计划步骤一起落记录。

## 鉴权与凭据

- **变更端点 fail-closed**：变更端点必须携带 `X-Deploy-Token`。未配置令牌时返回 503——绝不退化为无鉴权。只读端点保持开放。
- **清单里绝不出现凭据。** 装载层对清单结构全文扫描（`internal/manifest/manifest.go::scanCredentials`）：凭据类键名带字面值、任意位置的值形似密钥材料、占位符不是整值的 `${secret:<name>}` 引用——命中任一即整体拒绝装载。引用的密钥在运行时从本地凭据文件（0600，不进仓库）解析。
- 运维面板经服务端转发令牌，浏览器接触不到。见 [HA-Services-MaintenanceView](../HA-Services-MaintenanceView/index.md)。

## 产物

产物来源当前统一为 `local_path`（SHA-256 强制校验）；`ci_release` 来源已实现但未启用。启用发布时资产按硬约定命名：`<项目名>-linux-amd64` 加对应的 `.sha256` 文件。权威表述在 Deployer 仓 `README.md` 与 `knowledge/`。

## 边界

- 清单声明为面板管理或人工管理进程的项目一律视为外部项目：编排器只读列出，绝不触碰。
- 部署边界与范围决策：Deployer 仓 `knowledge/0007-bare-metal-orchestration-scope.md` 与 `knowledge/0011-container-orchestration-minimal-loop.md`。

## 相关

- [HA-Services-MaintenanceView](../HA-Services-MaintenanceView/index.md)：部署、回滚与状态的浏览器入口
