import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'en-US',
  title: 'SamuelWiki',
  description: 'A modern wiki and documentation hub for product teams',
  cleanUrls: true,
  lastUpdated: true,
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      link: '/',
      themeConfig: {
        search: {
          provider: 'local'
        },
        nav: [
          { text: 'Home', link: '/' },
          { text: 'Getting Started', link: '/guide/' },
          { text: 'Reference', link: '/reference/' },
          { text: 'FAQ', link: '/faq' },
          { text: 'Changelog', link: '/changelog' },
          { text: 'About', link: '/about' }
        ],
        sidebar: {
          '/guide/': [
            {
              text: 'Getting Started',
              items: [
                { text: 'Overview', link: '/guide/' },
                { text: 'Quick Start', link: '/guide/getting-started' },
                { text: 'Project Structure', link: '/guide/project-structure' },
                { text: 'Writing Docs', link: '/guide/writing-docs' }
              ]
            }
          ],
          '/reference/': [
            {
              text: 'Reference',
              items: [
                { text: 'Overview', link: '/reference/' },
                { text: 'Site Architecture', link: '/reference/architecture' },
                { text: 'Content Model', link: '/reference/content-model' },
                { text: 'Deployment', link: '/reference/deployment' }
              ]
            }
          ]
        },
        outline: {
          label: 'On this page',
          level: [2, 3]
        },
        docFooter: {
          prev: 'Previous page',
          next: 'Next page'
        },
        lastUpdated: {
          text: 'Last updated'
        },
        footer: {
          message: 'Built with VitePress for product documentation and knowledge sharing',
          copyright: 'Copyright © 2026 SamuelWiki'
        }
      }
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/zh/',
      themeConfig: {
        search: {
          provider: 'local'
        },
        nav: [
          { text: '首页', link: '/zh/' },
          { text: '开始使用', link: '/zh/guide/' },
          { text: '参考资料', link: '/zh/reference/' },
          { text: 'FAQ', link: '/zh/faq' },
          { text: '更新记录', link: '/zh/changelog' },
          { text: '关于', link: '/zh/about' }
        ],
        sidebar: {
          '/zh/guide/': [
            {
              text: '开始使用',
              items: [
                { text: '概览', link: '/zh/guide/' },
                { text: '快速开始', link: '/zh/guide/getting-started' },
                { text: '项目结构', link: '/zh/guide/project-structure' },
                { text: '文档编写规范', link: '/zh/guide/writing-docs' }
              ]
            }
          ],
          '/zh/reference/': [
            {
              text: '参考资料',
              items: [
                { text: '概览', link: '/zh/reference/' },
                { text: '站点架构', link: '/zh/reference/architecture' },
                { text: '内容模型', link: '/zh/reference/content-model' },
                { text: '部署说明', link: '/zh/reference/deployment' }
              ]
            }
          ]
        },
        outline: {
          label: '本页导航',
          level: [2, 3]
        },
        docFooter: {
          prev: '上一页',
          next: '下一页'
        },
        lastUpdated: {
          text: '最后更新于'
        },
        footer: {
          message: '使用 VitePress 构建的产品文档与知识中心',
          copyright: 'Copyright © 2026 SamuelWiki'
        }
      }
    }
  }
})
