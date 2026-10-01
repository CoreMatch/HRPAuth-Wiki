---
title: 微服务扩展
description: 理解 HRPAuth 的微服务扩展层：服务注册、服务发现、SDK 转发、路由规则、relay 转发与三级鉴权。
order: 10
tags:
  - microservices
  - architecture
  - routing
  - auth
updatedAt: 2026-09-01
---

# 微服务扩展

HRPAuth 的主服务流程严格遵循外部标准，**不可扩展**。因此所有微服务扩展都发生在主服务**前流程**和**后流程**：

- **前流程路由**：决定请求是转发给微服务，还是直接进入主服务。
- **后流程路由**：主服务返回结果后，把结果分发给指定微服务做旁路处理。

整个扩展层是一个**边缘编排器 / Router**，不改动 HRPAuth 的任何内部业务判断。

```
前端
  -> 扩展层（relay / 编排中间件）
       -> HRPAuth 核心（标准、未修改）
       -> 微服务（前置 / 后置）
```

## 服务注册 `POST /services/presence`

所有参与方——**包括前端 SPA 自己**——都是微服务。注册即一次"bonjour"握手，主服务回复 "ca va très bien, merci"。

```json
{
  "name": "texture-service",
  "ttl_seconds": 120,
  "scope": {
    "name": "texture-processing",
    "frontend_areas": ["skin", "user"]
  },
  "sdk_url": "http://127.0.0.1:2703/sdk/texture-sdk.js",
  "security_level": 1,
  "interacts_with": ["audit-service"]
}
```

| 字段 | 说明 |
| --- | --- |
| `name` | 服务唯一名。 |
| `ttl_seconds` | 自定存在时间（秒）。`<=0` 或省略 = **永不过期**，保留到主服务进程结束。 |
| `scope.name` | 服务的作用区域名。 |
| `scope.frontend_areas` | 服务覆盖的前端区域。**非空 = 对前端可见**；省略 = 仅内部存在。前端 SPA 靠此字段声明自己是前端。 |
| `sdk_url` | 指向一份 JS 文件的地址，告知目标前端区域如何使用本服务。文件内容由微服务与前端**自行协商**，主服务不解析、只转发。 |
| `security_level` | 服务鉴权级别：`0` 无须 / `1` 用户级 / `2` 运维级。默认 `0`，自动钳制到 `0..2`。 |
| `interacts_with` | 声明与其他服务的交互关系。隐式默认仅与主服务交互。 |

重复心跳保留 `first_seen`、刷新 `last_seen`，并可更新全部可选字段。过期记录在访问时惰性清理。

## 前端服务发现 `GET /services/list`

前端 SPA 拉取与自己相关的微服务列表。公开接口，调用方需已注册并携带自己的 `name`。

```
GET /services/list?name=hrpauth-webui
```

主服务用该前端的 `scope.frontend_areas`，只返回 `frontend_areas` **有交集**的微服务，前端自身不在列表中。

```json
{
  "success": true,
  "message": "services fetched",
  "data": [
    {
      "name": "texture-service",
      "scope_name": "texture-processing",
      "sdk_url": "http://127.0.0.1:2703/sdk/texture-sdk.js"
    }
  ]
}
```

## SDK 转发 `GET /services/sdk/:name`

通过主服务以 relay 方式拉取某服务的 JS 使用说明文件。主服务去微服务 `sdk_url` 拉取并**原样透传**（Content-Type 跟随微服务）。

```html
<script src="http://localhost:PORT/services/sdk/texture-service"></script>
```

- 要求服务已注册且声明了 `sdk_url`，否则 `404 sdk_not_found`。
- 转发失败返回 `502 relay_failed`。
- 前端应始终经此端点加载 SDK；`sdk_url` 是微服务内网地址，不可直连。

### 前端 SDK 暴露约定（HRPAuth-Web 现状）

本节描述 **HRPAuth-Web 当前实现**，并非 HRPAuth 强制要求；主服务依旧不解析 SDK 内容、只做原样转发。

参考前端 HRPAuth-Web 约定：SDK 经 `<script>` 注入后，在 `window['<服务名>-sdk']` 定义**全局对象**（如 `window['texture-service-sdk']`），前端通过 `getServiceSDK(name)` 读取。

```javascript
window['texture-service-sdk'] = {
  name: 'texture-service',
  version: '1.0.0',
  menu: { label: 'Texture Studio' },       // 可选：在导航栏添加菜单项
  dashboard: { label: 'Texture Studio' },  // 可选：在 Dashboard 侧栏添加菜单项（url 缺省回退 iframeUrl）
  iframeUrl: '/texture-service',            // 可选：iframe 回退地址
  mount: (container, { area }) => {         // 可选：把组件挂载到容器；可返回清理函数
    return () => { /* 清理 */ };
  },
  init: ({ area }) => { /* 可选 */ }
};
```

- `menu`（可选）：存在时前端在导航栏（仅登录后）添加菜单项，点击进入 `/service/<name>`。
- `dashboard`（可选）：存在时前端在 Dashboard 侧栏添加菜单项，选中后内容区显示该服务内容。
- `mount`（可选）：存在时前端调用 `mount(container, { area })`，把服务组件挂载到容器（任意渲染技术，可返回清理函数）；优先于 `iframeUrl`。
- `iframeUrl`（可选）：未提供 `mount` 时作为 `<iframe>` src 的**回退**；绝对 URL 与相对路径均原样透传。
- SDK 加载完成后可通过 `onSDKLoaded(name)` 订阅（见 `HRPAuth-Web/src/utils/serviceRegistry.ts`）。

## 路由规则 `POST /services/route`

微服务声明自己的路由规则。要求先 presence 注册。

```json
{
  "name": "texture-service",
  "rules": [
    {
      "scope": "texture-processing",
      "paths": ["/texture/*", "/texture/upload"],
      "pre_url": "http://texture-service:8080",
      "post_url": "http://texture-service:8080/post"
    }
  ]
}
```

- `paths`：精确路径 + `*` 前缀通配。
- `pre_url` 非空 = 声明前置路由；`post_url` 非空 = 声明后置路由。
- 同服务规则整体覆盖（后注册覆盖先注册）。

## Relay 转发 `POST` / `DELETE` / `GET /services/relay`

微服务要求主服务作为 relay 转发 URL：请求打到 `dest`（主服务对外路径）时，转发到 `source`（微服务地址）。要求先 presence 注册。

```json
{
  "name": "texture-service",
  "relays": [
    { "dest": "/serviceone", "source": "http://127.0.0.1:2703/serviceone" }
  ]
}
```

**路径映射（前缀拼接）**：

```
dest=/serviceone, source=http://127.0.0.1:2703/serviceone
GET /serviceone       -> http://127.0.0.1:2703/serviceone
GET /serviceone/foo   -> http://127.0.0.1:2703/serviceone/foo
GET /serviceonex      -> 不命中（边界隔离）
```

最长 `dest` 前缀优先。`dest` 规范化为以 `/` 开头、无尾斜杠。

删除：

```json
{ "name": "texture-service", "dest": "/serviceone" }
```

查询：

```
GET /services/relay          # 全部
GET /services/relay?name=    # 按服务过滤
```

## 请求编排

两个中间件挂在主服务路由之前，控制器零改动。

### 前置路由

请求命中声明了 `pre_url` 的规则时：

1. 计算所需鉴权级别 = **动态取所有命中 pre 服务 `security_level` 的最大值**（多服务交互最严格）。
2. 校验请求方凭据级别（见下），不足则 `401/403` 并终止。
3. 按规则顺序扇出转发（透传 method / query / Content-Type / `request_id`）。
4. 任一成功即短路，返回微服务响应。
5. **全部失败 → fail-open**，放行主服务正常处理。

### 后置路由

主服务响应 **2xx** 后，异步 POST `{path, method, request_id, status, response}` 给所有 `post_url`；非 2xx 不触发。后置是旁路语义，失败忽略，不影响主响应。

### Relay（独立机制）

relay 独立于 pre/post 编排，挂载更靠前。命中 `dest` 时校验请求方级别 ≥ 该服务 `security_level` 后转发。**转发失败返回 `502`，不回退主服务**。`/services/*` 系统端点不参与 relay 与编排。

## 三级鉴权

| 级别 | 含义 | 凭据 |
| --- | --- | --- |
| `0` | 无须 | 无凭据即可 |
| `1` | 用户级 | OAuth2 **用户** Bearer token |
| `2` | 运维级 | 管理 token M-T **或** OAuth2 服务 token（`client_credentials` / `.as-service` scope） |

解析顺序：无 `Authorization: Bearer` → `0`；token 等于 M-T → `2`；可解析的 OAuth2 token → 服务 token 为 `2`，否则 `1`；不可解析 → `0`。

执行规则：

- **单服务（隐式 only main）**：所需级别 = 该服务 `security_level`。
- **多服务参与同一请求**（如前置扇出）：所需级别 = 各服务 `security_level` 的 **max**，请求时动态计算。

凭据不足：无凭据 → `401 oauth_login_required`；有凭据但级别不够 → `403 insufficient_auth_level`。

后置分发由主服务自己发起，不参与请求方鉴权校验。
