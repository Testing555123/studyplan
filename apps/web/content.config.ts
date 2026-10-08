import { defineCollection, defineContentConfig, z } from '@nuxt/content'

/**
 * 电子书（30 篇）的 content collection 配置。
 *
 * 来源：批次 10 —— 把 `apps/docs`（VitePress 独立站）整体搬进主站，
 * 挂在 `/ebook` 前缀下。之所以必须搬：`FR-DOC-1` 是不可违反项，
 * 「文档由主站构建产出，不再由独立文档站产出」，VitePress 这条构建链
 * 与它直接冲突。下面每个决定都对应一条实测事实，不是猜测。
 *
 * ── 为什么内容是 `apps/web/content/` 而不是 `app/content/` ──
 * `@nuxt/content` 3 的默认目录是 `<rootDir>/content`（rootDir = `apps/web`），
 * 而 Nuxt 4 把源码目录改成 `app/` 之后，很多人以为内容也该跟着进 `app/`。
 * 沙盒 P19 用的就是根级 `content/` 并且跑通，这里保持一致，
 * 不额外指定内容目录、走模块默认值 —— 少一个配置项就少一处会和默认值打架的地方。
 *
 * ── 为什么必须装 better-sqlite3 ──
 * Content 3 用 SQLite 存解析后的文档索引，这是它的硬性依赖，
 * 且 Node 24 没有预编译包 → 从源码编译（`node:24-alpine` 需 `python3 make g++`，
 * 本地需 `pnpm approve-builds` / `allowBuilds` 放行 better-sqlite3 的 postinstall）。
 *
 * ── 两条最容易踩空的实测事实 ──
 * 1. **`type: 'page'` 不会自动生成路由**：模块源码里没有 extendPages / addPage /
 *    pages:extend 任何一处，所以路由由 `app/pages/ebook/[...slug].vue` 自己接，
 *    再用 `queryCollection('docs').path()` 取正文。直觉里「Content 会接管路由」是错的。
 * 2. **29 篇正文没有 frontmatter**（只有 `index.md` 有）：所以 schema 里字段必须
 *    全部 optional，标题实际来自正文首个 `#` 标题。写一个必填 `title` 会让构建直接失败。
 *
 * ── 踩坑记录（注释本身也是坑位）──
 * 块注释里不能出现「斜杠星 / 星号斜杠」这类连续序列，它会提前闭合注释，
 * 后面的内容被当成代码解析，而报错信息（Unexpected character /
 * Unterminated template）完全不指向真正原因。P19 连踩两次。
 */
export default defineContentConfig({
  collections: {
    docs: defineCollection({
      type: 'page',
      source: {
        include: '**/*.md',
        /**
         * `index.md` 是 VitePress 的 `layout: home` 首页（hero / features 那套
         * frontmatter 是 VitePress 主题专属语法，Content 3 不认）。
         * 它不在这里出现，是因为它**不是正文**：由下面的 `ebookHome` 单独接管，
         * 落地成手写页面 `app/pages/ebook/index.vue`。
         */
        exclude: ['index.md'],
        /**
         * 统一挂在 `/ebook` 前缀下，两件事同时成立：
         *   · 线上 VitePress 时代的 base 就是 `/ebook/`，旧链接形状不变；
         *   · 主站的 `/docs` 已被后端 Swagger 占用，文档不可能用 `/docs`。
         * 集合里每篇的 `path` 因此是 `/ebook/stages/stage-1` 这种形态，
         * 与 `app/pages/ebook/[...slug].vue` 收到的 `route.path` 一字不差，
         * `queryCollection().path()` 才能命中。
         */
        prefix: '/ebook',
      },
      schema: z.object({
        // 29 篇都没有 frontmatter，字段必须可选，缺省时标题由正文首个 h1 决定
        title: z.string().optional(),
        description: z.string().optional(),
      }),
    }),

    /**
     * `/ebook` 首页（`content/index.md`）单独成集合。
     *
     * 为什么要单独一个集合，而不是塞进上面的 `docs` 再排除：
     *   它的 frontmatter 是 VitePress 首页专属格式（`layout: home` + `hero` +
     *   `features`），那 4 张 feature 卡与页头文案是**内容**，迁过来时不能丢。
     *   单独成集合后，正文由 `ebook/index.vue` 用 ContentRenderer 渲染，
     *   hero / features 直接从解析出来的 frontmatter 读，
     *   避免「文案抄一份进 md、再抄一份进 vue 模板」这种双份维护
     *   （不可违反项 13：同一件事只留一个来源）。
     *
     * ⚠️ 为什么这几个字段是 `z.any()`：
     *   `hero` / `features` 的嵌套结构是 VitePress 主题定的，本项目只是原样取用，
     *   写成精确对象 schema 等于替别人的主题维护一份类型 —— 主题一改就构建失败。
     *   留 `any` 也让「未知 frontmatter 键」这个问题从根上不存在。
     */
    ebookHome: defineCollection({
      type: 'page',
      source: {
        include: ['index.md'],
        prefix: '/ebook',
      },
      schema: z.object({
        layout: z.any().optional(),
        hero: z.any().optional(),
        features: z.any().optional(),
      }),
    }),
  },
})
