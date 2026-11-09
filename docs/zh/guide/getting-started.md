# 快速开始

本页帮助你在本地运行、预览并构建这套 wiki 站点。

## 安装依赖

```bash
npm install
```

## 启动开发环境

```bash
npm run docs:dev
```

启动后，你可以在本地浏览器中实时查看文档变更效果。

## 构建生产版本

```bash
npm run docs:build
```

如果需要预览构建产物，可以继续执行：

```bash
npm run docs:preview
```

## 推荐工作流

1. 在 `docs/` 下新增或编辑 Markdown 页面
2. 同步更新 `docs/.vitepress/config.mts` 中的导航或侧边栏
3. 本地预览确认页面层级、链接和样式是否正常
4. 构建一次，确保站点可以正常生成静态文件
