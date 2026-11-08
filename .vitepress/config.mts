import { defineConfig } from 'vitepress'

// 渲染层配置（决策见 knowledge/0006-rendering-layer-over-markdown.md）。
// Markdown 是唯一内容源：srcDir 就是仓库根目录，站点从同一批 .md 构建，
// 不存在第二份内容副本。docs/ 是未提交的脚手架 WIP，显式排除。
export default defineConfig({
  lang: 'zh-CN',
  title: 'HRPAuth-Wiki',
  description: '项目生态的 Wiki：游戏服务栈与部署运维工具的现状文档',
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
    nav: [
      { text: '首页', link: '/' },
      { text: '游戏服务栈', link: '/Avalon/' },
      { text: '冻结快照', link: '/HRPAuth/' },
      { text: '决策记录', link: '/knowledge/' }
    ],
    sidebar: {
      '/': [
        {
          text: '游戏服务栈（现状）',
          items: [
            { text: 'Avalon', link: '/Avalon/' },
            { text: 'Avalon 插件三档', link: '/Avalon/plugins' },
            { text: 'Cascade', link: '/Cascade/' },
            { text: 'RW-Mod-Injector', link: '/RW-Mod-Injector/' },
            { text: 'RW-Mod-Injector 回归脚本', link: '/RW-Mod-Injector/regression' },
            { text: 'HA-Services-Deployer', link: '/HA-Services-Deployer/' },
            { text: 'HA-Services-MaintenanceView', link: '/HA-Services-MaintenanceView/' }
          ]
        },
        {
          text: '冻结快照（2026-10 拆分前后）',
          collapsed: true,
          items: [
            {
              text: 'HRPAuth',
              collapsed: true,
              items: [
                { text: '概览', link: '/HRPAuth/' },
                { text: '快速开始', link: '/HRPAuth/quick-start' },
                { text: '架构', link: '/HRPAuth/architecture' },
                { text: '配置', link: '/HRPAuth/configuration' },
                { text: '令牌系统', link: '/HRPAuth/token-system' },
                { text: '接口总览', link: '/HRPAuth/api-overview' },
                { text: '数据模型', link: '/HRPAuth/data-models' },
                { text: '功能开关', link: '/HRPAuth/feature-flags' },
                { text: '运维', link: '/HRPAuth/operations' },
                { text: '微服务扩展', link: '/HRPAuth/microservices' },
                { text: 'Profile Keys', link: '/HRPAuth/profile-keys' }
              ]
            },
            {
              text: 'HASkinProxy',
              collapsed: true,
              items: [
                { text: '概览', link: '/HASkinProxy/' },
                { text: '接口参考', link: '/HASkinProxy/api' }
              ]
            },
            {
              text: 'WinnerProxy',
              collapsed: true,
              items: [
                { text: '概览', link: '/WinnerProxy/' },
                { text: '架构', link: '/WinnerProxy/architecture' },
                { text: '数据流', link: '/WinnerProxy/data-flow' },
                { text: '配置', link: '/WinnerProxy/configuration' },
                { text: '部署', link: '/WinnerProxy/deployment' },
                { text: '故障排查', link: '/WinnerProxy/troubleshooting' },
                { text: '接口参考', link: '/WinnerProxy/api' }
              ]
            }
          ]
        },
        {
          text: '决策记录（knowledge）',
          collapsed: true,
          items: [
            { text: '索引与维护规则', link: '/knowledge/' },
            { text: '0001 纯 Markdown 内容仓（已取代）', link: '/knowledge/0001-plain-markdown-content-repo' },
            { text: '0002 内容冻结于服务拆分前', link: '/knowledge/0002-content-frozen-before-service-split' },
            { text: '0003 曾被 SamuelWiki 取代（已反转）', link: '/knowledge/0003-superseded-by-samuelwiki-site' },
            { text: '0004 外部行为以 HA-Contract 为准', link: '/knowledge/0004-ha-contract-defines-external-behavior' },
            { text: '0005 SamuelWiki 停用，场地回归', link: '/knowledge/0005-samuelwiki-retired-venue-restored' },
            { text: '0006 引入渲染层', link: '/knowledge/0006-rendering-layer-over-markdown' }
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
