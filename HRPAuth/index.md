---
title: HRPAuth
description: HRPAuth 项目的开发者 Wiki 首页，覆盖架构、配置、接口、数据模型与运维要点。
order: 1
tags:
  - auth
  - minecraft
  - yggdrasil
updatedAt: 2026-11-03
---

# HRPAuth

HRPAuth 是一个基于 Go 和 Gin 的认证服务，面向两个不同但相互关联的使用场景：

1. 面向站内业务的账号系统，提供注册、登录、邮箱验证、TOTP、用户资料和 OAuth2 授权服务器能力。
2. 面向 Minecraft 客户端和 Authlib-Injector 的 Yggdrasil 兼容接口，提供认证、会话、角色资料和纹理分发能力。**注意**：该能力在 2026-10 已从核心拆出，现由独立服务 [HRPAuth-Yggdrasil-API](https://github.com/CoreMatch/HRPAuth-Yggdrasil-API) 提供；皮肤素材库能力见 HASkinLib / HASkinProxy。

> 本 Wiki 内容冻结于 2026-10 拆分前后，涉及 Yggdrasil 的页面已补充归属标注；接口权威以 [HA-Contract](https://github.com/CoreMatch/HA-Contract) 的契约为准。

## 这套 Wiki 适合谁

- 需要在本地启动和调试 HRPAuth 的开发者
- 需要理解站内 OAuth2 与 Yggdrasil 双体系边界的后端开发者
- 需要对接 Yggdrasil 或站内业务接口的客户端开发者
- 需要排查配置、Redis、MySQL、纹理或密钥问题的运维同学

## 推荐阅读顺序

1. [快速开始](./quick-start.md)
2. [架构概览](./architecture.md)
3. [配置说明](./configuration.md)
4. [Token 与鉴权体系](./token-system.md)
5. [接口总览](./api-overview.md)
6. [数据模型](./data-models.md)
7. [功能开关](./feature-flags.md)
8. [运行与运维](./operations.md)
9. [微服务扩展](./microservices.md)
10. [Profile Keys (聊天签名)](./profile-keys.md) — Minecraft 1.19+ 聊天签名特性实现细节

## 核心认知

### 两套鉴权体系并存

HRPAuth 生态同时维护两套彼此独立的鉴权体系：

- 站内业务体系：以 OAuth2 Bearer token 为核心，服务于 WebUI 和后台管理接口（HRPAuth 核心）。
- Yggdrasil 体系：以 `accessToken + clientToken` 为核心，服务于 Minecraft 客户端和 Authlib-Injector（HRPAuth-Yggdrasil-API 服务）。

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

Yggdrasil 元信息、纹理签名、公钥暴露、会话校验、资料查询等能力都围绕 Minecraft 客户端兼容性展开——这些能力现由 HRPAuth-Yggdrasil-API（协议与游戏账号）与 HASkinLib / HASkinProxy（皮肤素材库与 CSL 兼容）承载，站内业务接口是核心服务里的另一条能力线。

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
