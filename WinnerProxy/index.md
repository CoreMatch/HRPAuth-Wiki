---
title: WinnerProxy 项目首页
description: WinnerProxy 是 HRPAuth 的 Yggdrasil 协议转换代理，支持 Mojang 玩家代注册与皮肤透传。
order: 1
tags:
  - proxy
  - yggdrasil
  - mojang
updatedAt: 2026-08-15
---

# WinnerProxy

WinnerProxy 是一个高性能的协议转换代理，位于 Minecraft 服务端与 HRPAuth 认证服务器之间。

## 核心功能

- **双鉴权链路**：优先校验 HRPAuth 账号，无会话时自动回退至 Mojang 官方验证。
- **自动代注册**：Mojang 正版玩家首次加服时，自动在 HRPAuth 中创建关联账号。
- **皮肤透传**：完美支持 Mojang 签名皮肤在 HRPAuth 体系下的正确渲染。
- **高性能缓存**：内置进程内缓存，大幅减少对上游认证服务器的压力。

## 文档导航

1. [架构设计](./architecture)
2. [数据流转](./data-flow)
3. [配置说明](./configuration)
4. [部署指南](./deployment)
5. [故障排查](./troubleshooting)
6. [API 参考](./api)
