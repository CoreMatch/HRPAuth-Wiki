import { defineConfig } from 'vitepress'

// 渲染层配置（决策见 knowledge/0006-rendering-layer-over-markdown.md）。
// Markdown 是唯一内容源：srcDir 就是仓库根目录，站点从同一批 .md 构建，
// 不存在第二份内容副本。docs/ 是未提交的脚手架 WIP，显式排除。
export default defineConfig({
  lang: 'zh-CN',
  title: 'HRPAuth-Wiki',
  description: '项目生态的 Wiki：每个项目现在怎么部署、怎么开发',
  cleanUrls: true,
  lastUpdated: true,
  srcDir: '.',
  srcExclude: ['docs/**', 'node_modules/**', '.github/**', 'build/**'],
  // README.md 是唯一内容源的入口页，映射为站点根路径与 knowledge 目录
  // 路由（不新建副本）。
  rewrites: {
    'README.md': 'index.md',
    'knowledge/README.md': 'knowledge/index.md'
  },
  themeConfig: {
    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: '搜索', buttonAriaText: '搜索' },
              modal: {
                displayDetails: '显示详细列表',
                resetButtonTitle: '清空查询',
                backButtonTitle: '关闭',
                noResultsText: '无法找到相关结果',
                footer: {
                  selectText: '选择',
                  navigateText: '切换',
                  closeText: '关闭'
                }
              }
            }
          }
        }
      }
    },
    // 主导航只保留首页。knowledge/ 是仓库内部记录，不进主导航，
    // 可经直接 URL（/knowledge/）与站内搜索访问。
    nav: [
      { text: '首页', link: '/' }
    ],
    // 侧边栏两级：项目 → 部署者 / 开发者。
    sidebar: {
      '/': [
        {
          text: 'Avalon',
          items: [
            { text: '部署者', link: '/Avalon/deployment' },
            { text: '开发者', link: '/Avalon/development' }
          ]
        },
        {
          text: 'HA-Services-Deployer',
          items: [
            { text: '部署者', link: '/HA-Services-Deployer/deployment' },
            { text: '开发者', link: '/HA-Services-Deployer/development' }
          ]
        },
        {
          text: 'Cascade',
          items: [
            { text: '部署者', link: '/Cascade/deployment' },
            { text: '开发者', link: '/Cascade/development' }
          ]
        },
        {
          text: 'RW-Mod-Injector',
          items: [
            { text: '文档', link: '/RW-Mod-Injector/' },
            { text: '回归脚本', link: '/RW-Mod-Injector/regression' }
          ]
        },
        {
          text: 'HA-Services-MaintenanceView',
          items: [
            { text: '文档', link: '/HA-Services-MaintenanceView/' }
          ]
        }
      ]
    },
    outline: {
      label: '本页目录',
      level: [2, 3]
    },
    docFooter: {
      prev: '上一页',
      next: '下一页'
    },
    lastUpdated: {
      text: '最后更新'
    },
    footer: {
      message: 'Markdown 是唯一内容源；页面事实以各源仓代码为准',
      copyright: 'AGPL-3.0'
    }
  }
})
