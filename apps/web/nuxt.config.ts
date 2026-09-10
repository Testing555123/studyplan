// Nuxt 4 的配置文件。它决定"框架如何组装这个应用"。
export default defineNuxtConfig({
  // 声明本项目特性兼容到哪个日期，框架据此决定新特性是否默认开启
  compatibilityDate: '2026-09-01',

  devtools: { enabled: true },

  // 模块是 Nuxt 的扩展机制：
  //   @nuxt/ui   —— 组件库 + Tailwind CSS 4（自动注入样式与组件）
  //   @pinia/nuxt —— 状态管理
  modules: ['@nuxt/ui', '@pinia/nuxt'],

  // 全局样式入口
  css: ['~/assets/css/main.css'],

  // 前端固定跑 3001，把 3000 让给后端，避免端口冲突
  devServer: {
    host: '0.0.0.0',
    port: 3001,
  },

  // 运行时配置：所有以 NUXT_PUBLIC_ 开头的环境变量会被自动注入到 public 下
  runtimeConfig: {
    public: {
      // 后端接口基地址。部署时可用 NUXT_PUBLIC_API_BASE 覆盖
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:3000/api',
    },
  },

  typescript: {
    strict: true,
    // typeCheck 交给 `pnpm typecheck` 单独跑，避免拖慢开发时的热更新
    typeCheck: false,
  },

  vite: {
    server: {
      // 允许通过任意域名访问开发服务器（容器 / 远程预览场景需要）
      allowedHosts: true,
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: 'studyplan · 学习社区',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: '一个边做边学的全栈项目：分享你的学习笔记与技术心得。' },
      ],
    },
  },
})
