import { defineConfig } from 'vitepress'

// 渲染层配置（决策见 knowledge/0006-rendering-layer-over-markdown.md）。
// Markdown 是唯一内容源：srcDir 就是仓库根目录，站点从同一批 .md 构建，
// 不存在第二份内容副本。
export default defineConfig({
  lang: 'zh-CN',
  title: 'HRPAuth-Wiki',
  description: '项目生态的 Wiki：每个项目现在怎么部署、怎么开发',
  cleanUrls: true,
  lastUpdated: true,
  srcDir: '.',
  srcExclude: ['node_modules/**', '.github/**', 'build/**'],
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
    // 两条轨道物理分开：/deploy/ 侧边栏只列部署者文档，/dev/ 只列开发者
    // 文档；互不出现对方条目。页脚 prev/next 跟随当前侧边栏，不跨轨。
    // 每轨末尾一个不显眼的入口回到首页重选身份。
    sidebar: {
      '/deploy/': [
        {
          text: '部署者文档',
          items: [
            { text: '总览', link: '/deploy/' },
            { text: 'Avalon', link: '/deploy/avalon' },
            { text: 'Cascade', link: '/deploy/cascade' },
            { text: 'RW-Mod-Injector（玩家使用）', link: '/deploy/rw-mod-injector' },
            { text: 'HA-Services-Deployer', link: '/deploy/ha-services-deployer' },
            { text: 'HA-Services-MaintenanceView', link: '/deploy/ha-services-maintenanceview' },
            { text: 'HRPAuth', link: '/deploy/hrpauth' },
            { text: 'HASkinProxy', link: '/deploy/haskinproxy' },
            { text: 'WinnerProxy', link: '/deploy/winnerproxy' },
            { text: 'MatchCoreArena-Server', link: '/deploy/matchcorearena-server' },
            { text: 'MatchCoreArena-VelocityGate', link: '/deploy/matchcorearena-velocitygate' },
            { text: 'MatchCoreArena-Client', link: '/deploy/matchcorearena-client' },
            { text: 'BedwarsRel-MCA', link: '/deploy/bedwarsrel-mca' },
            { text: 'HRPAuth-Yggdrasil-API', link: '/deploy/hrpauth-yggdrasil-api' },
            { text: 'HASkinLib', link: '/deploy/haskinlib' },
            { text: 'HA-WebUI-SDKHandler', link: '/deploy/ha-webui-sdkhandler' },
            { text: '↩ 重选身份', link: '/' }
          ]
        }
      ],
      '/dev/': [
        {
          text: '开发者文档',
          items: [
            { text: '总览', link: '/dev/' },
            { text: 'Avalon', link: '/dev/avalon' },
            { text: 'Cascade', link: '/dev/cascade' },
            { text: 'RW-Mod-Injector', link: '/dev/rw-mod-injector' },
            { text: 'RW-Mod-Injector 回归脚本', link: '/dev/rw-mod-injector-regression' },
            { text: 'HA-Services-Deployer', link: '/dev/ha-services-deployer' },
            { text: 'HA-Services-MaintenanceView', link: '/dev/ha-services-maintenanceview' },
            { text: 'HRPAuth', link: '/dev/hrpauth' },
            { text: 'HASkinProxy', link: '/dev/haskinproxy' },
            { text: 'WinnerProxy', link: '/dev/winnerproxy' },
            { text: 'MatchCoreArena-Server', link: '/dev/matchcorearena-server' },
            { text: 'MatchCoreArena-VelocityGate', link: '/dev/matchcorearena-velocitygate' },
            { text: 'MatchCoreArena-Client', link: '/dev/matchcorearena-client' },
            { text: 'BedwarsRel-MCA', link: '/dev/bedwarsrel-mca' },
            { text: 'HRPAuth-Yggdrasil-API', link: '/dev/hrpauth-yggdrasil-api' },
            { text: 'HASkinLib', link: '/dev/haskinlib' },
            { text: 'HA-WebUI-SDKHandler', link: '/dev/ha-webui-sdkhandler' },
            { text: '↩ 重选身份', link: '/' }
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
