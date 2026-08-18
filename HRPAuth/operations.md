---
title: 运行与运维
description: HRPAuth 的启动行为、后台任务、密钥生成、迁移与常见排查入口。
order: 9
tags:
  - operations
  - deployment
  - runtime
updatedAt: 2026-08-15
---

# 运行与运维

这一页聚焦“服务跑起来以后会发生什么”。

## 启动顺序

当前实现中的启动过程大致如下：

1. 初始化配置文件
2. 加载配置
3. 初始化数据库连接
4. 执行数据库迁移
5. 初始化 Redis
6. 启动 Token 清理任务
7. 启动代注册用户清理任务
8. 启动 Session 清理任务
9. 注册路由并开始监听

## 后台任务

### Token 清理

- 启动时执行一次
- 之后每小时执行一次

主要清理：

- `invalid` 状态 token
- 已过期 token

### 代注册用户清理

- 启动时执行一次
- 之后每 24 小时执行一次
- 每次 Manage Token 注册成功后还会异步触发一次

清理对象是长期不活跃的 `cbh = false` 用户。

### Session 清理

- 启动时执行一次
- 之后每 24 小时执行一次

主要清理过期会话，避免 `sessions` 表不断膨胀。

## 密钥管理

### 自动生成的签名路径

首次初始化配置时，服务会为 Yggdrasil 签名准备公钥和私钥路径。

### `POST /generate-key`

这个接口用于生成 RSA 密钥对。当前实现里有两个值得注意的点：

1. 当 `keygen.enable == 1` 时接口会拒绝请求
2. 成功生成后会把内存中的 `KeyGen.Enable` 设为 `1`

如果你要把这个接口暴露到生产环境，建议始终配合反向代理或额外访问控制。

## 数据库迁移

HRPAuth 在启动过程中会主动执行 migration，因此数据库结构不需要靠应用运行中的 `AutoMigrate` 来兜底。

这意味着：

- 新环境部署更省事
- 但启动阶段也更依赖数据库连通性和 migration 文件完整性

## Redis 在运行中的角色

Redis 不是可有可无的附属件，它承载了多项短生命周期数据：

- 图形验证码
- 邮箱验证码
- 登录限流

如果 Redis 不可用，注册和验证类能力通常会先出问题。

## 文件系统要求

至少需要保证这些路径可写：

- `config.yaml` 所在目录
- 签名密钥输出目录
- `textures_storage` 指向的纹理目录

如果容器或宿主机权限没配好，最先出现的往往不是业务错误，而是上传、生成密钥或配置初始化失败。

## 最常见的运维排查入口

### 服务起不来

优先检查：

- MySQL 是否可达
- Redis 是否可达
- `config.yaml` 是否生成成功
- migration 是否执行失败

### Yggdrasil 客户端登录异常

优先检查：

- `GET /` 是否返回正确元信息和公钥
- 签名密钥路径是否有效
- `skin_domains`、`callback.url`、`frontend.url` 是否符合部署域名

### 注册流程异常

优先检查：

- `security.enable_captcha`
- Redis
- 邮箱格式和唯一性
- Manage Token 路径下是否显式声明了 `auth_type: "manage"`

### 纹理相关异常

优先检查：

- `textures_storage` 是否可写
- `profile_properties` 是否更新
- `/textures/:hash` 是否可直接访问

## 建议保留的观测点

- 启动日志
- 定时清理日志
- 认证失败日志
- 纹理上传错误日志
- SMTP 发送失败日志

如果后面需要把这套 Wiki 再补深一层，我建议下一步新增一页“故障排查手册”，把常见报错和对应排查路径单独整理出来。
