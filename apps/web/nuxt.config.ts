// Nuxt 4 的配置文件。它决定"框架如何组装这个应用"。
export default defineNuxtConfig({
  // 声明本项目特性兼容到哪个日期，框架据此决定新特性是否默认开启
  compatibilityDate: '2026-09-01',

  // devtools 只在开发期有价值，打进生产既增大产物又暴露内部结构
  devtools: { enabled: false },

  /**
   * SSR 保持开启（Nuxt 默认就是 true，这里不写该键即可）。
   *
   * 曾一度关掉它做纯静态化，动机是"少养一个 Node 进程"——
   * 那个动机在 systemd 方案下成立，但改用容器后**进程成本归零**，
   * 于是关掉 SSR 就成了纯亏损：丢掉首屏渲染、SEO、
   * 以及 `useApi.ts` 里"服务端转发 Cookie"那条分支（首屏无法带登录态）。
   *
   * 一句话：约束变了，当初为绕开约束而做的取舍就该重新审视。
   */

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
    /**
     * **服务端（SSR 期间）专用**的后端地址。不在 public 下，所以永远不会进浏览器。
     *
     * 为什么不和下面的 apiBase 共用一个值？因为同一份代码在两种位置需要两种地址：
     *   - 浏览器：请求从用户机器发出，必须走同域 / 公网地址；
     *   - SSR：请求从容器内部发出，走回环地址最快，也绕开了域名与证书。
     *
     * 而且 `$fetch` 在服务端**不接受相对路径**（没有 origin 可解析），
     * 所以浏览器侧能用的 `/api`，在 SSR 侧必须有这个绝对地址兜底。
     */
    apiBaseInternal: process.env.NUXT_API_BASE_INTERNAL || 'http://127.0.0.1:3000/api',

    public: {
      /**
       * 后端接口基地址（**浏览器侧使用**）。
       *
       * ⚠️ 这个值是**构建期常量**：Nuxt 会把它烘焙进客户端 bundle，
       *    改环境变量不会生效，必须重新 build。
       *
       * 生产（同域部署）时建议直接设成相对路径 `/api`，好处有两个：
       *   1. 同域 → Cookie 天然同源，不需要跨站配置；
       *   2. 不带域名 → 换域名不用重新构建（这正是构建期常量最容易踩的坑）。
       */
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
