// Nuxt 4 的配置文件。它决定"框架如何组装这个应用"。
import { readFileSync } from 'node:fs'

// 读取同目录 package.json，仅取 version 字段（用于构建期版本号）。
// 用 fs 读取而非 `import pkg from './package.json'`，是因为 Nuxt 配置是 ESM，
// JSON import 断言在不同 Node/Bundler 版本兼容性参差，fs 读取最稳。
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

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
  //   @nuxt/ui     —— 组件库 + Tailwind CSS 4（自动注入样式与组件）
  //   @pinia/nuxt  —— 状态管理
  //   @nuxt/content —— 电子书正文（见下方 modules 的说明与 content.config.ts）
  /**
   * 模块列表。
   *
   * 曾经这里还有 `motion-v/nuxt`（动效库），随光晕与 3D 倾斜一起移除 ——
   * 那两个效果是全站唯一需要「连续计算」的地方，改版后所有动效都能用
   * CSS transition / animation 表达，为一个已经没有消费者的库
   * 继续承担依赖体积与模块启动成本并不划算。
   *
   * `@nuxt/content` 是批次 10 加进来的：电子书 30 篇从 `apps/docs`（VitePress
   * 独立站）迁到本应用的 `/ebook` 前缀。触发原因是不可违反项 `FR-DOC-1`
   * ——「文档由主站构建产出，不再由独立文档站产出」，准出条件是
   * 「构建链不再产出独立文档站」。配置见 `content.config.ts`，
   * 路由见 `app/pages/ebook/`（Content 3 不会自动为 `type: 'page'` 生成路由）。
   */
  modules: ['@nuxt/ui', '@pinia/nuxt', '@nuxt/content'],

  /**
   * 旧电子书路径 → 新路径的重定向：**这一轮刻意不启用**。
   *
   * ── 为什么现在不开 ──
   * 这是顺序敏感项 7 / 不可违反项 14 担心的那件事：301 一旦生效，
   * 而内容迁移还没验证过，旧链接会被重定向到一批可能 404 的新路径上，
   * 而且 301 是**浏览器缓存级**的错误 —— 用户此后每次访问都直接跳 404，
   * 回滚都回不来（清缓存才算完）。所以发布必须分两次：
   *   第一次：内容与 `/ebook` 路由上线（就是本次改动），跑通 poc/p10-verify.mjs；
   *   第二次：确认 29 篇全部可达，再取消下面这段注释。
   *
   * ── 启用时的两个实测坑（P19 沙盒验证）──
   * 1. 简写 `{ redirect: '/x' }` 发的是 **307**，不是 301；要 301 必须显式写
   *    `statusCode: 301`。307 会被搜索引擎当成临时跳转，旧权重不迁移，
   *    等于白做一次跳转。
   * 2. 规则只覆盖**旧站**路径形状（`/guide/**` 等），绝不能把 `/ebook/**`
   *    自己也写进重定向表，否则新路径指向新路径，形成自环、全部 404。
   *
   * 启用方式：整段取消注释。`**` 是 nitro 的通配，会把后缀原样带到目标。
   * 四条通配即可覆盖 29 篇（`/guide` 8 篇 + `/stages` 8 + `/exercises` 8 + `/design` 5）；
   * 不再单列 `/guide/roadmap` 这种精确规则 —— 同一条路径同时命中精确与通配时，
   * nitro 按声明顺序取第一条，多留一条就是给自己埋顺序坑。
   *
   * ⚠️ 这四条通配会占住 `/guide` `/stages` `/exercises` `/design` 四个一级路径。
   *    将来主站若想在根级别新增同名页面，必须先确认不被这里的重定向吃掉。
   */
  // routeRules: {
  //   '/guide/**': { redirect: { to: '/ebook/guide/**', statusCode: 301 } },
  //   '/stages/**': { redirect: { to: '/ebook/stages/**', statusCode: 301 } },
  //   '/exercises/**': { redirect: { to: '/ebook/exercises/**', statusCode: 301 } },
  //   '/design/**': { redirect: { to: '/ebook/design/**', statusCode: 301 } },
  // },

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

      /**
       * 构建版本号（**浏览器侧使用**），形式为 `v0.1.0 · 2026-09-23 14:02 UTC`。
       *
       * ⚠️ 同样是**构建期常量**：值在 `nuxt build` 时由 package.json 的 version
       *    拼接当前 UTC 时间戳算好，烘焙进客户端 bundle；改环境变量不会生效，
       *    必须重新 build（与 apiBase / siteUrl 同口径）。
       *
       * 用途：开发/部署后能一眼判断「站点是否重建更新过」——每次 rebuild
       *    时间戳都不同。容器时区固定 UTC，故显示也标注 UTC，避免歧义。
       *
       * 默认自动计算；CI 或特殊场景可用 `NUXT_PUBLIC_APP_VERSION` 覆盖整串。
       */
      appVersion:
        process.env.NUXT_PUBLIC_APP_VERSION ||
        `v${pkg.version} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,

      /**
       * 这里**曾经**有一个 `docsUrl`（默认 `http://localhost:3002`，生产由
       * Dockerfile.vercel 注入 `/ebook/`），指向 VitePress 独立站。
       * 批次 10 把它删掉了：电子书现在是本应用 `/ebook` 下的路由
       * （`app/pages/ebook/` + `content/`），"文档站地址"这个概念不再存在 ——
       * 留着一个能指向别处的配置项，只会诱使后来人把链接指回另一个站点。
       *
       * ⚠️ **线上还看不见这次迁移**，原因在本应用之外（本轮不许动部署文件）：
       *    `docker/vercel/entrypoint.mjs` 会先把 `/ebook/**` 拦下来，
       *    用磁盘上的 VitePress 产物直接返回（`Dockerfile.vercel` 第 112 行
       *    仍在 `pnpm --filter @studyplan/docs build`）。也就是说生产环境的
       *    `/ebook` 目前**由入口脚本代管，轮不到 Nuxt**。
       *    删除顺序因此是固定的（顺序敏感项 7）：先等 `node poc/p10-verify.mjs
       *    --runtime` 全绿，再在同一次发布里删掉 `apps/docs`、Dockerfile 的
       *    docs 构建层与 entrypoint 的 EBOOK 静态分支，并清掉
       *    `ARG/ENV NUXT_PUBLIC_DOCS_URL`。反过来先删部署侧，线上 /ebook 立刻 404。
       */
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
        // 品牌图标：矢量 svg 覆盖现代浏览器，.ico 含 16–256px 多尺寸兜底旧浏览器，
        // 180px png 供 iOS 主屏（apple-touch-icon 不接受 svg）
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/icon-180.png' },
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
        // 站点级 OG 图兜底：各页面（app.vue / 帖子详情）会用运行时绝对地址覆盖它，
        // 这里保证没单独设置的页面（/roadmap、/trending…）也有图可分享
        { property: 'og:image', content: `${process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3001'}/og-cover.jpg` },
        { name: 'twitter:image', content: `${process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3001'}/og-cover.jpg` },
      ],
    },
  },
})
