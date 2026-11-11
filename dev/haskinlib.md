---
title: HASkinLib 开发者文档
description: HASkinLib 的代码结构、纹理存储与预览管线、鉴权与分工边界。
order: 2
tags:
  - haskinlib
  - development
updatedAt: 2026-11-12
---

# HASkinLib — 开发

皮肤库服务（Gin，默认 `:2701`）：纹理上传、元数据管理、预览图渲染、按哈希拉取。不实现任何 Yggdrasil 端点、不签发游戏会话、不直接对 Minecraft 客户端说话。

## 代码结构

```
main.go              入口：CORS → 各控制器 → 路由
controllers/         upload、listpreview、previewfile、pulltexture、deletetexture、profile、auth
services/            上传校验、图片管线、删除等业务逻辑
models/、database/   纹理元数据模型与迁移
clients/             core_client.go：HRPAuth HTTP API 客户端
config/              配置加载与迁移（config.go、migrations.go，均有测试）
docs/skinlib-api.md  仓内接口参考
```

## 构建与测试

```bash
go build -o ./build/hasl   # build.sh 声明的构建命令（Go 1.26.10）
go vet ./...
go test ./...
```

## HTTP 表面

- `POST /texture/upload`——鉴权上传 + 校验 + 预览图生成。
- `GET /texture/listpreview`——公开分页元数据画廊（16 条/页）。
- `GET /texture/preview/:preview_file`——公开 WebP 预览文件。
- `GET /texture/pull/:hash`——公开按 SHA-256 哈希拉取原始 PNG。
- `POST /texture/delete`——鉴权删除本人纹理（强制物理删文件，仓内 knowledge/0006）。
- `GET /profile/textures`——鉴权个人纹理列表；已实现但仓内接口文档标注"暂时搁置"，路由仍注册，运维侧不当作产品面。
- `GET /health` 存活探针（不查库）；`GET /example` 示例端点。

## 鉴权

经 HRPAuth HTTP API，不共享 Go 库：认证路由提取 Bearer token，调 `POST {core_api.base_url}/internal/verify-token`（`controllers/auth.go::AuthenticateUser`、`clients/core_client.go::VerifyToken`）；服务自身对核心用 OAuth2 client_credentials。

## 存储与图片管线

- 自有 MySQL 表：`hasl_texture_list_skin`、`hasl_texture_list_cape`；专用数据库 + 独立迁移链（golang-migrate 内嵌 SQL，`schema_migrations` 表自有，仓内 knowledge/0004）。
- 磁盘存储：纹理与预览各自目录；哈希针对 **re-encoded PNG**（不是用户上传的原始字节）——外部校验哈希必须拉取存储字节重算，不能哈希用户原文件（仓内 knowledge/0002）。
- 预览管线：上传时生成 2D 预览、nearest-neighbor 8x 缩放、WebP 编码。
- 已知成本：画廊按 varchar 列 `FIND_IN_SET` 过滤标签（无标签索引），当前规模可用。

## 分工边界与契约

- Minecraft 协议面归 HRPAuth-Yggdrasil-API，CustomSkinLoader 转换归 HASkinProxy；往本仓加 Yggdrasil 路由违反边界（仓内 knowledge/0005）。
- 对外契约：HA-Contract `docs/api/openapi/haskinlib-business.yaml`；契约缺失时在 HA-Contract 侧补，契约优先于代码表现（仓内 knowledge/0007）。
