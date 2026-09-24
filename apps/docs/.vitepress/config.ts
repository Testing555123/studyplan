import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vitepress'

/**
 * 仓库里有没有 `.git` —— 决定能否启用「最后更新于」。
 *
 * 为什么需要判断？VitePress 的 `lastUpdated` 会 **spawn git** 去读每个文件的
 * 提交时间。而容器镜像里既没有 git 命令、也没有 `.git` 目录（两者都被有意排除，
 * 否则构建上下文会膨胀到几百 MB），于是构建会直接失败：
 *
 *     [vitepress] spawn git ENOENT
 *
 * 与其"让人记得在构建时传一个环境变量把它关掉"（忘一次就构建失败），
 * 不如让配置自己适应环境：有 `.git` 就启用，没有就自动关闭。
 * 需要强制覆盖时用 `VITEPRESS_LAST_UPDATED=true|false`。
 */
const hasGit = existsSync(resolve(process.cwd(), '../../.git'))
const lastUpdated =
  process.env.VITEPRESS_LAST_UPDATED === undefined
    ? hasGit
    : process.env.VITEPRESS_LAST_UPDATED === 'true'

/**
 * 电子书站点的配置。
 *
 * 导航（nav）按"学习顺序"组织，而不是按文件结构：
 *   路线图 → 环境准备 → Git 工作流 → 逐阶段正文 → 经验档案 → 规划练习
 *
 * 「经验档案」放的是**实战沉淀**（上线踩过的坑、排查方法论），
 * 它和阶段正文的区别是：阶段正文讲"怎么做"，经验档案讲"做的时候会撞上什么"。
 */
export default defineConfig({
  lang: 'zh-CN',
  title: 'studyplan 全栈实战',

  /**
   * 站点挂载路径（**必须以 `/` 开头、以 `/` 结尾**）。
   *
   * 本地保持默认的 `/`：pnpm dev:docs 仍然直接访问 http://localhost:3002。
   * 线上容器构建时注入 VITEPRESS_BASE=/ebook/ —— 因为电子书与主站同域，
   * 挂在子路径下（主站的 /docs 已被后端的 Swagger 占用）。
   *
   * ⚠️ 写成 `ebook` 或 `/ebook`（缺斜杠）会让全部资源 404。
   *    而本地 base 是 `/`，所以这个错误**只在容器里才会暴露** ——
   *    本地验证时必须检查"页面里引用的资源 URL 能否 200 拉回"，不能只看首页打不打得开。
   */
  base: process.env.VITEPRESS_BASE ?? '/',
  description: '从零到上线：Nuxt 4 + NestJS 11 + MongoDB Atlas 的边做边学电子书',

  // 只对内容做「最后更新于」标记；它依赖 git，因此由上面的 hasGit 自动决定
  lastUpdated,

  // VitePress 默认会把所有链接都做"死链检查"。
  // 但本电子书大量引用 http://localhost:3000/api 这类**本地开发地址**，
  // 它们在构建时当然不可达。这不是内容错误，因此必须关掉这个检查。
  ignoreDeadLinks: true,

  markdown: {
    // 代码块显示行号，方便正文里按行引用
    lineNumbers: true,
  },

  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '学习路线', link: '/guide/roadmap' },
      {
        text: '经验档案',
        items: [
          { text: '部署经验：上线时踩过的十个坑', link: '/guide/deployment-lessons' },
          { text: '调试经验：出问题时先看什么', link: '/guide/debugging-lessons' },
          { text: '集成经验：从接口到浏览器', link: '/guide/integration-lessons' },
          { text: '每日 GitHub 报道装置：设计与运维', link: '/guide/daily-digest' },
        ],
      },
      {
        text: '设计',
        items: [
          { text: '视觉风格分析', link: '/design/01-visual-style-analysis' },
          { text: '设计系统建议', link: '/design/02-design-system-recommendations' },
          { text: '问题与修复', link: '/design/03-issues-and-fixes' },
          { text: '修改方案', link: '/design/04-modification-plan' },
          { text: '品牌规范', link: '/design/brand' },
        ],
      },
      {
        text: '阶段正文',
        items: [
          { text: '阶段 1 · 工程地基与 TypeScript 起步', link: '/stages/stage-1' },
          { text: '阶段 2 · 前端原型', link: '/stages/stage-2' },
          { text: '阶段 3 · 后端与数据库', link: '/stages/stage-3' },
          { text: '阶段 4 · 首次联调', link: '/stages/stage-4' },
          { text: '阶段 5 · 认证与发帖', link: '/stages/stage-5' },
          { text: '阶段 6 · 互动功能', link: '/stages/stage-6' },
          { text: '阶段 7 · AI 能力', link: '/stages/stage-7' },
          { text: '阶段 8 · 测试与上线', link: '/stages/stage-8' },
        ],
      },
    ],

    sidebar: [
      {
        text: '开始之前',
        items: [
          { text: '学习路线图', link: '/guide/roadmap' },
          { text: '项目目录地图', link: '/guide/project-structure' },
          { text: '环境准备', link: '/guide/environment' },
          { text: 'Git 工作流', link: '/guide/git-workflow' },
        ],
      },
      {
        text: '阶段正文',
        collapsed: false,
        items: [
          { text: '阶段 1 · 工程地基与 TypeScript 起步', link: '/stages/stage-1' },
          { text: '阶段 2 · 前端原型', link: '/stages/stage-2' },
          { text: '阶段 3 · 后端与数据库', link: '/stages/stage-3' },
          { text: '阶段 4 · 首次联调', link: '/stages/stage-4' },
          { text: '阶段 5 · 认证与发帖', link: '/stages/stage-5' },
          { text: '阶段 6 · 互动功能', link: '/stages/stage-6' },
          { text: '阶段 7 · AI 能力', link: '/stages/stage-7' },
          { text: '阶段 8 · 测试与上线', link: '/stages/stage-8' },
        ],
      },
      {
        text: '经验档案',
        collapsed: false,
        items: [
          { text: '部署经验：上线时踩过的十个坑', link: '/guide/deployment-lessons' },
          { text: '调试经验：出问题时先看什么', link: '/guide/debugging-lessons' },
          { text: '集成经验：从接口到浏览器', link: '/guide/integration-lessons' },
          { text: '每日 GitHub 报道装置：设计与运维', link: '/guide/daily-digest' },
        ],
      },
      {
        text: '设计',
        collapsed: true,
        items: [
          { text: '视觉风格分析', link: '/design/01-visual-style-analysis' },
          { text: '设计系统建议', link: '/design/02-design-system-recommendations' },
          { text: '问题与修复', link: '/design/03-issues-and-fixes' },
          { text: '修改方案', link: '/design/04-modification-plan' },
          { text: '品牌规范', link: '/design/brand' },
        ],
      },
      {
        text: '规划练习',
        collapsed: true,
        items: [
          { text: '练习 1 · 拆解阶段 2', link: '/exercises/stage-1' },
          { text: '练习 2 · 拆解阶段 3', link: '/exercises/stage-2' },
          { text: '练习 3 · 拆解阶段 4', link: '/exercises/stage-3' },
          { text: '练习 4 · 拆解阶段 5', link: '/exercises/stage-4' },
          { text: '练习 5 · 拆解阶段 6', link: '/exercises/stage-5' },
          { text: '练习 6 · 拆解阶段 7', link: '/exercises/stage-6' },
          { text: '练习 7 · 拆解阶段 8', link: '/exercises/stage-7' },
          { text: '练习 8 · 复盘与排期', link: '/exercises/stage-8' },
        ],
      },
    ],

    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '目录',
    darkModeSwitchLabel: '深色模式',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
    lastUpdated: { text: '最后更新于' },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '没有找到结果',
            resetButtonTitle: '清除条件',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
          },
        },
      },
    },

    footer: {
      message: '边做边学 · 每阶段交付「可运行代码 + 笔记 + 规划练习」',
      copyright: 'studyplan 教学项目',
    },
  },
})
