---
title: MatchCoreArena-Client 部署者文档
description: MCA-Client 的现状（无分发包）、从源码构建的完整路径、配置与 SERVER_URL 优先级、本地启动步骤与常见启动失败。
order: 1
tags:
  - matchcorearena
  - deployment
updatedAt: 2026-11-08
---

# MatchCoreArena-Client — 部署

MatchCoreArena-Client（MCA-Client）是竞技平台的玩家桌面客户端：Wails v2（Go 后端 + React/TypeScript 前端）。功能：登录（邮箱密码 + TOTP）、匹配排队（单人/组队）、战绩浏览、排行榜、好友列表（只读）、设置。

**客户端永不写对局数据**——对局上报在游戏侧上报方与运维面板，客户端只做读取与玩家自己的会话/队列操作。

## 现状：没有分发包

仓库有发布工作流（`release.yml`：`v*` tag 触发，构建 Linux 与 Windows 产物），但**仓库没有任何 tag，也没有任何 Release**——发布流程从未被触发。当前拿到可运行客户端的唯一路径是**从源码构建**。

## 运行前提（源码构建）

| 项 | 要求 |
|---|---|
| Go | `go.mod` 声明 `go 1.26.10`（README 写 Go 1.26+；start.sh 的提示文案写 1.25+，以 go.mod 为准） |
| Node.js | 18+（CI 用 22） |
| Wails CLI | `go install github.com/wailsapp/wails/v2/cmd/wails@latest`；CI 固定 v2.15.0，与 go.mod 的 wails v2.15.0 一致 |
| Linux 系统库 | WebKitGTK 2.41+：Debian/Ubuntu 装 `libgtk-3-dev`、`libwebkit2gtk-4.1-dev`（CI 安装清单） |
| ha-ui 子模块 | 前端经 `file:../ha-ui` 依赖共享设计系统，克隆必须带子模块 |
| 服务端 | 一个可达的 MatchCoreArena-Server（默认 `https://arena.mcnb.dev/`） |

## 从源码构建

### 1. 取代码（必须带子模块）

```sh
git clone --recurse-submodules <repository-url>
cd MatchCoreArena-Client
# 已有克隆补子模块：
git submodule update --init
```

### 2. 装依赖

```sh
go mod tidy
cd frontend && npm install && cd ..
# 或一条命令：make install
```

### 3. 构建

```sh
wails build          # 或 make build
```

产物：`build/bin/MatchCoreArenaClient`（文件名来自 `wails.json` 的 `outputfilename`）。

开发模式（带热重载，不产出二进制）：

```sh
./start.sh           # 自动检查 Go/Node/Wails、装依赖、建默认配置，最后 wails dev
# 或直接
wails dev
```

## 配置

配置文件：`~/.matchcorearena/config.json`（首次经 `start.sh` 启动会从 `config.example.json` 复制生成）：

```json
{
  "server_url": "https://arena.mcnb.dev/",
  "debug": false,
  "game_server_host": "",
  "game_server_port": 0
}
```

| 键 | 类型 | 默认 | 作用 |
|---|---|---|---|
| `server_url` | string | `https://arena.mcnb.dev/` | MCA-Server 根地址 |
| `debug` | bool | `false` | 调试日志 |
| `game_server_host` | string | `""` | 游戏服地址本地兜底：仅当成局未携带 `join_target` 时使用（可在设置页改） |
| `game_server_port` | number | `0` | 同上 |

### `server_url` 优先级（高到低）

1. 配置文件中非空的 `server_url`（总是胜出）；
2. 环境变量 `MCA_SERVER_URL`（仅当配置文件未显式设置或文件不存在）；
3. 内置默认 `https://arena.mcnb.dev/`。

## 本地启动步骤

1. `wails build` 产出二进制后运行 `./build/bin/MatchCoreArenaClient`（或开发模式 `wails dev`）；
2. 登录：邮箱 + 密码；启用 TOTP 的账号随后输入 6 位验证码；
3. 进入 Play 页即可排队（单人选模式；组队填成员 UUID 名单，整队同排同结算）；
4. 成局后客户端自动向 SamuelClient 交接（回环通道、不传凭据）；拿不到任何游戏服地址时界面给出可复制的 `host:port` 供手动加入。

令牌过期自动经 `/api/auth/refresh` 刷新；刷新失败回到登录页。

## 验证

- 窗口打开、登录成功、Play 页显示段位卡与近期对局 = 服务端连通正常；
- Rankings 页能拉出榜单 = 读取链路正常；
- 指向自建服务端时，先确认 `server_url` 对应的 `/api/status` 为 200 再启动客户端。

## 常见启动失败

| 现象 | 原因 | 处理 |
|---|---|---|
| `wails build`/`wails dev` 报 WebKit/GTK 相关错误 | Linux 缺 WebKitGTK 2.41+ 开发库 | 装 `libgtk-3-dev`、`libwebkit2gtk-4.1-dev` 后重试；`wails doctor` 可体检环境 |
| 前端构建报找不到 `@ha/ui` | ha-ui 子模块未初始化 | `git submodule update --init` |
| 构建错误难定位 | 残留产物 | `make clean` 后 `make install` 重来；`make typecheck` 单独跑前端类型检查 |
| 连不上服务端 | `server_url` 错或服务未运行 | 按优先级核对配置；`curl <server_url>/api/status` 验证 |
| 登录失败 | 密码错 / 需要 TOTP / 账号被锁 | 逐项排查 |
| 好友页报 501 `mca_not_implemented` | 服务端好友功能显式未实现 | 预期行为，界面如实显示错误，不是客户端故障 |
| 成局后无法自动进入 SamuelClient | Windows/macOS 上深链与进程探测未实现（INTEROP-SPEC 已知缺口）；或 SamuelClient 未安装 | 按界面给出的 `host:port` 手动加入；Linux 下确认 SamuelClient 已注册 `matchcore://` 链接 |
