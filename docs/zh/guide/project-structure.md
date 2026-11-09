# 项目结构

下面是当前 wiki 站点的核心目录职责说明。

## 目录总览

```text
docs/
  .vitepress/
    config.mts         # 站点配置、导航、侧边栏、搜索和语言设置
    theme/
      index.ts         # 自定义主题入口
      style.css        # 站点样式扩展
  guide/               # 英文入门与维护说明
  reference/           # 英文参考资料
  zh/                  # 中文本地化页面
  index.md             # 英文首页
  faq.md               # 英文 FAQ
  changelog.md         # 英文更新记录
  about.md             # 英文关于页面
```

## 内容组织建议

- `guide/`：放操作型文档，强调“怎么做”
- `reference/`：放长期稳定的说明，强调“是什么”和“为什么”
- 顶层单页：适合承载 FAQ、更新记录、关于我们这类跨栏目内容

## 扩展方式

新增一个文档专题时，推荐这样做：

1. 在对应语言目录下创建专题目录
2. 新增一个入口页 `index.md`
3. 把子页面加入 `config.mts` 的侧边栏
4. 在首页或相关栏目补上入口链接
