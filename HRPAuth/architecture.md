---
title: 架构概览
description: 从模块划分、请求流转、后台任务和双鉴权体系理解 HRPAuth 的整体结构。
order: 3
tags:
  - architecture
  - backend
  - auth
updatedAt: 2026-08-15
---

# 架构概览

HRPAuth 可以理解为一个单体后端服务，内部同时承载两类能力：

- 面向站内业务的账号与资料系统
- 面向 Minecraft 生态的 Yggdrasil 兼容层

## 代码目录对应的职责

### 入口层

- `main.go` 负责应用启动、路由注册、中间件和周期清理任务

### 控制器层

- `controllers/auth_controller.go`：登录票据、注册、登出
- `controllers/user_info_controller.go`：用户信息、邮箱声明、Mojang 绑定开关
- `controllers/totp_controller.go`：TOTP 生成、配置、校验、状态查询
- `controllers/texture_controller.go`：站内纹理上传、删除、查询
- `controllers/yggdrasil_controller.go`：Yggdrasil 元信息、认证、会话、资料、纹理
- `controllers/startup_controller.go`：配置初始化和迁移、数据库迁移

### 服务层

- `services/auth_service.go`：认证、Token 状态机、角色创建、清理逻辑
- `services/captcha_service.go`：图形验证码生成与校验
- `services/email_service.go`：邮件发送和邮箱验证码
- `services/texture_service.go`：纹理文件和 `profile_properties` 的维护

### 存储层

- `models/`：GORM 模型
- `database/`：数据库连接与 SQL migration
- `redis/`：Redis 客户端初始化

## 路由分层

### 站内业务接口

典型接口包括：

- `/login` (已废弃)
- `/register`
- `/user`
- `/oauth/*`
- `/email-verification`
- `/totp/*`
- `/change-*`
- `/texture/*`
- `/captcha/*`

这部分接口现在主要围绕 **OAuth2 Bearer token** 展开。

### Yggdrasil 接口

典型接口包括：

- `/`
- `/authserver/*`
- `/sessionserver/*`
- `/api/profiles/minecraft`
- `/api/user/profile/:uuid/:textureType`
- `/textures/:hash`

这部分接口围绕 `accessToken + clientToken` 展开。

## 两条主链路

### 链路一：站内账号体系

```text
浏览器 / WebUI
  -> JSON 或表单请求
  -> Auth/User/TOTP/Texture/Captcha Controller
  -> Service
  -> MySQL / Redis / 文件存储
```

适合注册、登录、资料修改、验证码、TOTP 和站内纹理管理。

### 链路二：Yggdrasil 兼容体系

```text
Minecraft 客户端 / Authlib-Injector
  -> Yggdrasil Controller
  -> AuthService / TextureService
  -> MySQL / 文件存储
```

适合客户端认证、会话校验、角色信息读取和纹理分发。

## 为什么会有两套 Token

这是 HRPAuth 最值得先理解的设计点。

### 站内业务 Token

- 以 `oauth2_access_tokens` / `oauth2_refresh_tokens` 为核心
- 第一方快捷登录通过 `login_ticket + TOTP` 完成二步验证
- 用于站内业务接口

### 微服务 Token

- 默认由内置超级客户端签发
- 通过 `client_credentials` 获取
- 代用户操作时仍需显式目标参数与 endpoint-level scope

### Yggdrasil Token

- `accessToken`
- `clientToken`
- 状态记录在 `tokens` 表中
- 带有 `valid`、`temporarily_invalid`、`invalid` 三态

## 后台任务

服务启动后会同时启动三个周期任务：

1. Token 清理，每小时执行一次
2. 代注册用户清理，每 24 小时执行一次
3. Session 清理，每 24 小时执行一次

其中代注册用户清理还会在每次服务 token 代注册成功后异步触发一次。

## 配置初始化策略

HRPAuth 倾向于把“能自动做的初始化”放到启动流程里：

- 自动生成 `config.yaml`
- 自动迁移旧版配置
- 自动生成签名密钥路径
- 自动执行数据库 migration

这让首次部署更直接，但也要求你认真阅读启动日志。

## 纹理能力如何复用

站内 `/texture/*` 和 Yggdrasil 的纹理接口操作的是同一份底层数据：

- 文件落在 `textures_storage`
- 数据记录在 `profile_properties`
- 最终通过 `/textures/:hash` 对外分发

所以站内上传的皮肤，最终也会反映到 Yggdrasil 资料查询中。
