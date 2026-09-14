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

  /**
   * 色彩模式：**默认亮色**。
   *
   * `preference` 是"用户没手动切过时用哪个"，`fallback` 是"系统偏好
   * 读不到时的兜底"。两个都设成 light，才能确保首次访问一定看到亮色。
   *
   * 为什么选亮色作为默认？
   *   这是个内容型社区，用户主要行为是**长时间阅读**帖子与项目简介，
   *   浅底深字在长时间阅读下更舒适。暗色不做删减，仍然完整支持，
   *   由用户手动切换（页头的 ColorModeButton）——
   *   只是不再作为"没表态时的默认值"。
   *
   * 注意：Nuxt UI 会自动注册 @nuxtjs/color-mode，
   * 所以这里**不需要**再把它加进 modules。
   */
  colorMode: {
    preference: 'light',
    fallback: 'light',
  },

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

      /**
       * 站点对外的绝对地址（**不带结尾斜杠**）。
       *
       * 为什么必须有它？canonical、og:url、sitemap 里的 `<loc>`、
       * robots.txt 指向的 sitemap —— 这些都要求**绝对 URL**，
       * 而服务端在 SSR 时只拿得到 `host`，拿不到"对外到底是不是 https"。
       * （容器内是明文 HTTP，TLS 由平台边缘终止 ——
       *   直接用请求里的协议拼出来的就是 `http://...`，那是错的。）
       *
       * ⚠️ 同样是构建期常量，由 `Dockerfile.vercel` 的 `ARG/ENV` 注入。
       *    沿用 `apiBase` 的既有约定，而不是另起一套 `site` 配置 ——
       *   「同一件事只有一种做法」比「用更时髦的写法」重要。
       *
       * 本地开发走默认值 `http://localhost:3001`，所以本地也能看到
       * 完整可用的 canonical，而不是一行空字符串。
       */
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3001',
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

    optimizeDeps: {
      /**
       * 强制预打包共享包。
       *
       * 为什么必须显式写这一行？
       *   `@studyplan/shared` 是 pnpm workspace 链接包，Vite 默认**不预打包**
       *   链接包 —— 它会走 `@fs` 把 dist 里的文件当源码直接喂给浏览器。
       *   而共享包编译出来是 **CommonJS**（NestJS 必须跑 CJS，见
       *   packages/shared/tsconfig.json），浏览器只认 ESM，
       *   于是只能依赖 Vite 对 CJS 的"静态导出识别"来兜底。
       *
       *   这个兜底并不可靠：新增一个导出（avatarGradientClass）之后识别没跟上，
       *   浏览器直接抛
       *     "does not provide an export named 'avatarGradientClass'"
       *   导致**整页客户端 JS 全部失效**（点按钮、切筛选全都没反应）。
       *
       *   ⚠️ 最阴险的地方在于：此时 **SSR 渲染的 HTML 看起来完全正常** ——
       *   页面能看、数据也在，只有交互是死的。不打开控制台根本发现不了。
       *   本项目就是这么踩到的，而且第一轮排查还被 Vite 缓存误导过。
       *
       * 交给预打包后，esbuild 会把 CJS 完整转换成 ESM，导出逐一对上，
       * 从根上不再依赖那个静态识别。
       */
      include: ['@studyplan/shared'],
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: 'studyplan · 学习社区',
      /**
       * 字体外链：**异步加载，不再阻塞首屏渲染**。
       *
       * ── 原来为什么慢 ──
       * 一条普通的 `<link rel="stylesheet">` 是**阻塞渲染**的：
       * 浏览器必须等它下载并解析完，才会画第一个像素。
       * 而这个请求指向 `fonts.googleapis.com`，是**第三方域名** ——
       * 要额外付一次 DNS + TCP + TLS，且完全不在我们的控制范围内。
       * 用户看到的是"页面白屏一下才出现内容"，而根因在别人家的服务器上。
       *
       * ── media="print" 这个技巧 ──
       * 把 media 声明成 print，浏览器就认为"这份样式当前用不上"，
       * 于是**不阻塞渲染**地去下载它；下载完成后 `onload` 把它切回 all，
       * 字体随即生效。代价是字体到位前会先显示系统字体（`display=swap`
       * 本来也是这个行为），但**页面不再等它**。
       *
       * 为什么不干脆删掉外链？异步化已经把代价降到"不阻塞"，
       * 保留它能维持既有的排版观感。若将来要彻底去掉第三方依赖，
       * 正确做法是自托管字体文件（那时这里整段删掉）。
       */
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;700&display=swap',
          media: 'print',
          onload: "this.media='all'",
        },
      ],
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: '一个边做边学的全栈项目：分享你的学习笔记与技术心得。' },
        /**
         * 站点级社交分享 meta。
         *
         * 为什么放在这里而不是 app.vue？
         *   这两个值**不依赖运行时信息**（不随页面、不随域名变化），
         *   属于"站点是什么"而不是"这一页是什么" —— 放在配置里，
         *   任何页面都天然继承，不需要每个页面都记得写一遍。
         *
         *   而会随页面变化的（og:title / og:description / canonical）
         *   放在 app.vue 与详情页里做**覆盖**，见那两处的注释。
         *
         * twitter:card 用 summary_large_image：我们有一张 1200x630 的封面，
         * 大图卡片的点击率明显高于小图摘要，既然图已经付了成本就用足。
         */
        { property: 'og:site_name', content: 'studyplan' },
        { property: 'og:type', content: 'website' },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
    },
  },
})
