---
title: 配置说明
description: HRPAuth 的配置结构、关键字段、默认行为和实际使用时的注意事项。
order: 4
tags:
  - config
  - deployment
  - yggdrasil
updatedAt: 2026-08-15
---

# 配置说明

HRPAuth 使用根目录下的 `config.yaml` 作为主配置文件。首次启动时，如果文件不存在，服务会自动生成一份默认配置。

## 配置生命周期

启动时会按以下顺序处理配置：

1. 检查配置文件是否存在
2. 不存在则写入默认配置
3. 存在则检查 `version`
4. 如果版本较旧，执行链式迁移
5. 如果版本高于当前程序支持范围，仅告警，不重写文件

## 顶层结构

当前代码中的配置结构大致如下：

- `version`
- `site`
- `server`
- `security`
- `callback`
- `frontend`
- `keygen`
- `database`
- `verification_code`
- `redis`
- `smtp`
- `manage`
- `yggdrasil`

## 最重要的几个配置块

### `site`

定义服务展示信息，会影响：

- `GET /status`
- Yggdrasil 元信息中的服务名称和实现版本

### `server`

- `port`：监听端口，默认配置生成值是 `:2778`
- `cors_origin`：CORS 来源控制

如果你前后端分离部署，通常会先改这里。

### `database`

MySQL 连接相关配置：

- `host`
- `db_name`
- `user`
- `password`
- `charset`

服务启动时会在数据库初始化后继续执行 migration，所以数据库连通性是启动成功的硬前提。

### `redis`

Redis 主要用于：

- 图形验证码
- 邮箱验证码
- 登录限流相关计数

`prefix` 很重要，建议在共享 Redis 场景下保持隔离。

### `smtp`

邮箱验证和测试邮件都依赖 SMTP 配置。即使你不打算马上启用邮件功能，也建议先把这个配置块补齐，避免后续联调时把错误归因到接口层。

### `manage`

`manage.token` 是运维级别的超级凭证。

它的特点是：

- 首次生成配置时会自动写入
- 不属于任何用户
- 只能在请求中显式声明 `auth_type: "manage"` 时进入管理路径

### `security`

这是站内业务层的安全配置，不在 `yggdrasil` 下：

- `password_cost`
- `rate_limit_max_attempts`
- `rate_limit_window_sec`
- `enable_captcha`
- `captcha_ttl`

这里最容易搞错的是：验证码配置属于顶层 `security`，不是 `yggdrasil.security`。

### `yggdrasil.server`

这一块控制 Minecraft 生态相关的对外表现：

- `name`
- `implementation`
- `version`
- `signature_public_key_path`
- `signature_private_key_path`
- `textures_storage`
- `links.homepage`
- `links.register`
- `skin_domains`

如果 `links` 没填，元信息接口会回退到 `frontend.url` 相关值。

### `yggdrasil.security`

这一块和协议层行为相关：

- `token_expiry_days`
- `session_expiry_seconds`
- `max_texture_width`
- `max_texture_height`

### `yggdrasil.feature_flags`

这里放的是协议兼容和行为开关，详见 [功能开关](./feature-flags)。

## 默认生成配置时的几个事实

按当前实现，默认配置里会：

- 生成 Manage Token
- 为 Yggdrasil 签名准备公私钥路径
- 默认开启图形验证码
- 默认开启 `non_email_login`
- 默认开启 `legacy_skin_api`
- 默认开启 `username_check`

这些默认值更适合“先跑起来”，不等于一定适合你的生产环境。

## 迁移相关注意点

配置迁移的目标不是只做字段重命名，而是尽量保证旧配置还能被当前版本读懂。

你需要特别注意：

- 旧版本中的 captcha 配置已经迁移到顶层 `security`
- 迁移前会备份原配置
- 写回配置时使用临时文件和重命名，避免半写入

## 实际使用建议

### 本地开发

优先确认：

- `database.*`
- `redis.*`
- `frontend.url`
- `callback.url`
- `yggdrasil.server.textures_storage`

### 测试或生产环境

额外确认：

- `cors_origin` 不要继续使用 `*`
- `smtp` 是否可连通
- 签名密钥路径是否有正确权限
- `manage.token` 是否妥善保管
- `skin_domains` 是否和公开域名一致

## 容易误解的点

### `keygen.enable`

当前实现中，`POST /generate-key` 在 `keygen.enable == 1` 时会被拒绝。也就是说，这个字段更接近“禁用开关”而不是“启用开关”，读配置时需要留意。

### `callback.url` 和 `frontend.url` 不是同一个概念

- `callback.url` 更偏后端对外地址
- `frontend.url` 更偏前端站点地址

Yggdrasil 元信息中的链接回退逻辑会用到 `frontend.url`。
