---
title: 快速开始
description: 从零启动 HRPAuth 的最短路径，包括依赖、配置、运行和联调检查项。
order: 2
tags:
  - getting-started
  - dev
  - backend
updatedAt: 2026-08-15
---

# 快速开始

这是一条面向开发者的最短启动路径，目标是在本地把 HRPAuth 跑起来，并确认站内接口和 Yggdrasil 接口都可用。

## 运行前准备

你至少需要准备：

- Go 开发环境
- MySQL
- Redis
- 一个可写的项目目录，用于生成 `config.yaml` 与密钥文件

## 首次启动会发生什么

程序启动时会自动：

1. 检查根目录下是否存在 `config.yaml`
2. 如果不存在，生成默认配置
3. 检查配置版本并按需迁移
4. 初始化 MySQL 和 Redis
5. 执行数据库迁移
6. 启动 HTTP 服务和后台清理任务

如果你第一次启动就退出，最常见的原因不是代码问题，而是数据库、Redis 或配置项还没填对。

## 一次完整的本地启动流程

### 1. 启动依赖服务

先确保 MySQL 和 Redis 可连接，再确认你知道它们的连接参数。

### 2. 首次运行服务

```bash
go run .
```

首次运行后，项目根目录会生成 `config.yaml`。默认配置里，服务监听端口是 `:2778`。

### 3. 修改关键配置

至少建议确认这些字段：

- `server.port`
- `callback.url`
- `frontend.url`
- `database.*`
- `redis.*`
- `smtp.*`
- `yggdrasil.server.signature_public_key_path`
- `yggdrasil.server.signature_private_key_path`
- `yggdrasil.server.textures_storage`

### 4. 再次启动

配置改完后重新运行：

```bash
go run .
```

### 5. 验证服务状态

优先检查：

- `GET /status`
- `GET /`

如果这两个接口都正常，说明站内接口和 Yggdrasil 元信息至少已经能对外工作。

## 本地联调建议

### 站内业务链路

推荐按下面顺序联调：

1. `GET /captcha/enabled`
2. `POST /captcha`
3. `POST /register`
4. `POST /login`
5. `POST /user`
6. `POST /email-verification`
7. `POST /totp/setup`
8. `POST /totp/verify`

### Yggdrasil 链路

推荐按下面顺序联调：

1. `GET /`
2. `POST /authserver/authenticate`
3. `POST /authserver/validate`
4. `POST /sessionserver/session/minecraft/join`
5. `GET /sessionserver/session/minecraft/hasJoined`
6. `GET /sessionserver/session/minecraft/profile/:uuid`

## 你会很快遇到的几个坑

### `config.yaml` 是自动生成的，但默认值不是生产值

默认配置只是为了让结构完整，不代表可以直接上线。尤其是数据库、Redis、SMTP、前后端 URL 都需要按环境修改。

### `remember_token` 和 `accessToken` 完全不是一回事

前者服务于站内业务接口，后者服务于 Yggdrasil 接口。把它们混用会得到一堆看似合理、实际毫无帮助的报错。

### Manage Token 必须显式声明 `auth_type: "manage"`

当前实现不会因为你传入的 token 恰好等于 Manage Token 就自动切换到运维模式。要走管理路径，必须同时满足：

- token 等于配置中的 `manage.token`
- 请求体或参数显式声明 `auth_type: "manage"`

### 图形验证码只在普通注册路径生效

普通 WebUI 注册会受 `security.enable_captcha` 约束；Manage Token 注册路径不会走验证码校验。

## 最小验收清单

- `GET /status` 返回在线状态
- `GET /` 返回 Yggdrasil 元信息和公钥
- 普通用户可以完成注册和登录
- `POST /user` 能用 `remember_token` 读到当前用户
- Yggdrasil 登录能拿到 `accessToken`、`clientToken` 和角色资料
- Redis 中能看到验证码或限流相关 key
- MySQL 中能看到 `users`、`profiles`、`tokens`、`sessions` 等表
