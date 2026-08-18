---
title: HRPAuth
description: HRPAuth 项目的开发者 Wiki 首页，覆盖架构、配置、接口、数据模型与运维要点。
order: 1
tags:
  - auth
  - minecraft
  - yggdrasil
updatedAt: 2026-08-15
---

# HRPAuth

HRPAuth 是一个基于 Go 和 Gin 的认证服务，面向两个不同但相互关联的使用场景：

1. 面向站内业务的账号系统，提供注册、登录、邮箱验证、TOTP、用户资料和纹理管理。
2. 面向 Minecraft 客户端和 Authlib-Injector 的 Yggdrasil 兼容接口，提供认证、会话、角色资料和纹理分发能力。

## 这套 Wiki 适合谁

- 需要在本地启动和调试 HRPAuth 的开发者
- 需要理解双 Token 体系和 Manage Token 行为的后端开发者
- 需要对接 Yggdrasil 或站内业务接口的客户端开发者
- 需要排查配置、Redis、MySQL、纹理或密钥问题的运维同学

## 推荐阅读顺序

1. [快速开始](./quick-start)
2. [架构概览](./architecture)
3. [配置说明](./configuration)
4. [Token 与鉴权体系](./token-system)
5. [接口总览](./api-overview)
6. [数据模型](./data-models)
7. [功能开关](./feature-flags)
8. [运行与运维](./operations)

## 核心认知

### 两套鉴权体系并存

HRPAuth 同时维护两套彼此独立的鉴权体系：

- 站内业务体系：以 `remember_token` 为核心，服务于 WebUI 和后台管理接口。
- Yggdrasil 体系：以 `accessToken + clientToken` 为核心，服务于 Minecraft 客户端和 Authlib-Injector。

这两套 Token 不能混用。开发联调时，先分清当前调用的是哪一条链路，通常能省掉一半的排查时间。

### 配置和数据库在启动时自动处理

服务启动时会自动完成这些步骤：

1. 检查并生成 `config.yaml`
2. 校验并迁移配置版本
3. 初始化 MySQL 与 Redis 连接
4. 执行数据库迁移
5. 启动后台清理任务

这意味着本地启动门槛不高，但也意味着配置错误往往会在启动期直接暴露。

### 默认目标是兼容 Minecraft 生态

Yggdrasil 元信息、纹理签名、公钥暴露、会话校验、资料查询等能力都围绕 Minecraft 客户端兼容性展开，业务接口只是同一服务里的另一条能力线。

## 代码视角下的模块划分

- `main.go`：应用入口、路由注册、清理任务启动
- `controllers/`：HTTP 入口层
- `services/`：认证、验证码、邮件、纹理等业务逻辑
- `models/`：GORM 模型定义
- `config/`：配置加载与配置迁移
- `database/`：数据库连接和 SQL 迁移
- `redis/`：Redis 初始化
- `utils/`：Token、UUID、密码、TOTP 等通用工具

## 当前 Wiki 的原则

- 以当前代码实现为准
- 参考历史文档补足背景信息，但不直接照搬旧内容
- 优先帮助开发者快速启动、快速定位接口、快速理解约束
