---
title: HASkinLib 部署者文档
description: HASkinLib 皮肤库服务的运行前提、从零部署、配置项表、端口暴露、验证与故障对照。
order: 1
tags:
  - haskinlib
  - deployment
updatedAt: 2026-11-08
---

# HASkinLib — 部署

HASkinLib 是生态的皮肤库服务：纹理上传、预览图生成、按哈希拉取原文件、个人材质管理。接口契约在 HA-Contract（`docs/api/openapi/haskinlib-business.yaml`）与本仓 `docs/skinlib-api.md`。

## 运行前提

| 项 | 要求 |
|---|---|
| Go | 源码构建需要：`go.mod` 声明 `go 1.26.10`；或用 Docker（Dockerfile 自带，README 未给出 docker 运行指引） |
| MySQL | 必需，启动硬依赖（迁移失败即退出）；最低版本仓库未声明 |
| Redis | **无依赖** |
| HRPAuth 核心 | 运行期经 `core_api` 调用（如令牌校验）；**非启动硬依赖**——核心不在也能启动，相关端点调用会失败 |
| 进程监督 | 生产声明为 `manager: aapanel`（面板管理，编排器只读） |

## 从零部署

```sh
go build -o ./build/hasl     # build.sh 内容即此一条
./build/hasl                 # 首次运行：自动生成 config.yaml（内置默认值）与数据目录
# 停止，编辑 config.yaml，再启动
./build/hasl
```

- 配置文件不存在时按内置默认自动生成（version 7）；已有低版本配置启动时自动迁移（1→7 链）。
- 数据库迁移启动时自动执行（golang-migrate，失败即退出）。
- 生产在位：`/www/wwwroot/sl/hasl`（deploy-manifest）。
- 仓库未声明：初始化建库语句、systemd/面板之外的进程管理方式。

## 配置项表

配置文件 `config.yaml`（模板版本 7），启动时读取，改动重启生效。默认值取自代码生成逻辑：

### server

| 键 | 默认 | 作用 |
|---|---|---|
| `port` | `:2701` | 监听地址 |
| `cors` | `*` | 允许的 Origin；`*` 时回显请求方 Origin |

### database

| 键 | 默认 | 作用 |
|---|---|---|
| `host` | `127.0.0.1` | MySQL 地址（`port` 为 0 时端口内联在 host） |
| `port` | `0` | MySQL 端口（v7 新增；0 = 旧行为） |
| `db_name` | `hrpa` | 库名 |
| `user` / `password` | `hrpa` / `hrpa` | 凭据（生产必改） |
| `charset` | `utf8mb4` | 字符集 |
| `table_prefix` | `hasl_` | 表前缀 |

### core_api

| 键 | 默认 | 作用 |
|---|---|---|
| `base_url` | `http://127.0.0.1:2778` | HRPAuth 核心地址 |
| `client_id` / `client_secret` | `""` | 服务凭据；留空时依赖核心的端点不可用 |

### textures

| 键 | 默认 | 作用 |
|---|---|---|
| `storage_dir` | `./data/textures` | 纹理原文件目录 |
| `preview_storage_dir` | `./data/previews` | 预览图目录 |
| `max_upload_bytes` | `2097152`（2 MiB） | 上传文件大小上限 |
| `max_request_bytes` | `2359296`（2 MiB + 256 KiB） | 请求体上限 |
| `rate_limit_per_minute` | `5` | 上传限流（每窗口次数） |
| `rate_limit_window_seconds` | `60` | 限流窗口 |

## 端口与暴露面

| 端口 | 用途 | 暴露 |
|---|---|---|
| `2701`/tcp（`server.port`） | 全部 HTTP 端点 | 公网（deploy-manifest `exposure: public`） |

端点一览（详见 `docs/skinlib-api.md`）：

| 端点 | 说明 |
|---|---|
| `GET /health` | 存活探针：不查数据库、不做重活 |
| `POST /texture/upload` | 上传材质并生成预览图 |
| `GET /texture/listpreview` | 预览列表（无需鉴权，冒烟端点） |
| `GET /texture/preview/:preview_file` | 预览图文件 |
| `GET /texture/pull/:hash` | 按哈希拉取原文件 |
| `POST /texture/delete` | 删除当前用户材质（数据库记录 + 磁盘文件） |
| `GET /profile/textures` | 个人材质列表 |

数据目录：`./data/textures`、`./data/previews`（升级/备份时保留）。

## 启动 / 停止 / 升级 / 回滚

- **启动/停止**：面板形态经 aapanel；独立形态直接运行二进制。
- **升级**：替换二进制重启；数据库迁移自动补增量，配置自动迁移，数据目录保留。
- **回滚**：换回旧二进制；配置 version 高于旧程序支持时按启动提示处理。

## 验证

```sh
# 健康探针（不查库）
curl -s http://127.0.0.1:2701/health
# 期望 200：{"success":true,"message":"ok","data":{"status":"ok"}}

# 预览列表（编排冒烟同款：无需鉴权、不依赖特定用户数据；空库返回空列表也正常）
curl -s http://127.0.0.1:2701/texture/listpreview
# 期望 200，响应含 items 与 total 字段
```

## 故障对照

| 现象 | 原因 | 处理 |
|---|---|---|
| 启动失败于数据库迁移 | MySQL 不可达/凭据错/库不存在 | 核对 `database.*`，先建库 |
| 上传/删除/个人列表报错，健康探针正常 | HRPAuth 核心不可达或 `core_api` 凭据未配（这些端点运行期依赖核心） | 恢复核心、补齐凭据；`/health` 与 `listpreview` 不受影响 |
| 上传被拒 | 超出 `max_upload_bytes` / 命中限流 | 按响应错误码核对；必要时调整 `textures.*` 上限 |
