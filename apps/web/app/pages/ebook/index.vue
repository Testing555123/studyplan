<script setup lang="ts">
/**
 * `/ebook` 电子书目录页（替代 VitePress 的 `layout: home` 首页）。
 *
 * ── 为什么这一页是手写的 ──
 * `content/index.md` 的 frontmatter（`layout: home` + `hero` + `features`）是
 * VitePress 主题专属语法：Content 3 不认 `layout`，也没有 home 布局组件。
 * 但那套文案是**内容**而不是样式，所以这里把它当数据读出来渲染
 * （见 content.config.ts 的 `ebookHome` 集合），而不是抄一份进模板 ——
 * 抄一份就等于同一句话有两个来源，改一处漏一处（不可违反项 13）。
 *
 * ── 导航结构 ──
 * 5 组顺序照搬 `.vitepress/config.ts` 的 sidebar：开始之前 → 阶段正文 →
 * 经验档案 → 设计 → 规划练习。它按**学习顺序**组织，不是按目录结构，
 * 所以这张表不能由文件列表自动生成（自动出来的顺序是错的）。
 * 每条都带 `path`，与集合里 `prefix: '/ebook'` 生成的 path 一字不差，
 * 于是「某篇没被索引到」会当场显示成缺项，而不是静默少一条链接 ——
 * 「页面看起来正常但内容少了」是最难被发现的那类事故。
 */

/** hero 里的 action.link 是 VitePress 时代的站内绝对路径（`/guide/roadmap`），
 *  当时靠 base=/ebook/ 补前缀；现在是本应用内的路由，必须自己补上 /ebook，
 *  否则点它会走到主站的 /guide/roadmap（不存在）→ 404。 */
const EBOOK_BASE = '/ebook'

const { data: home } = await useAsyncData('ebook-home', () => queryCollection('ebookHome').first())

const { data: docs } = await useAsyncData('ebook-docs', () =>
  queryCollection('docs').order('path', 'ASC').all(),
)

/** Content 3 的 page 集合一定给 path，title 取决于有没有 frontmatter */
type DocRow = { path: string; title?: string }

/**
 * `content/index.md` 的 frontmatter 形态，只声明本项目真正读到的键。
 * 写成真类型而不是 `any`：这份结构是**内容契约**，VitePress 时代就是这么写的，
 * 哪天改错了字段名，这里会编译期报错，而 `any` 只会让页面静默出空白。
 */
type HeroAction = { theme?: string; text: string; link: string }
type EbookHome = {
  hero?: { name?: string; text?: string; tagline?: string; actions?: HeroAction[] }
  features?: { title: string; details: string }[]
}

const GROUPS: { text: string; items: { path: string; text: string }[] }[] = [
  {
    text: '开始之前',
    items: [
      { path: '/ebook/guide/roadmap', text: '学习路线图' },
      { path: '/ebook/guide/project-structure', text: '项目目录地图' },
      { path: '/ebook/guide/environment', text: '环境准备' },
      { path: '/ebook/guide/git-workflow', text: 'Git 工作流' },
    ],
  },
  {
    text: '阶段正文',
    items: [
      { path: '/ebook/stages/stage-1', text: '阶段 1 · 工程地基与 TypeScript 起步' },
      { path: '/ebook/stages/stage-2', text: '阶段 2 · 前端原型' },
      { path: '/ebook/stages/stage-3', text: '阶段 3 · 后端与数据库' },
      { path: '/ebook/stages/stage-4', text: '阶段 4 · 首次联调' },
      { path: '/ebook/stages/stage-5', text: '阶段 5 · 认证与发帖' },
      { path: '/ebook/stages/stage-6', text: '阶段 6 · 互动功能' },
      { path: '/ebook/stages/stage-7', text: '阶段 7 · AI 能力' },
      { path: '/ebook/stages/stage-8', text: '阶段 8 · 测试与上线' },
    ],
  },
  {
    text: '经验档案',
    items: [
      { path: '/ebook/guide/deployment-lessons', text: '部署经验：上线时踩过的十个坑' },
      { path: '/ebook/guide/debugging-lessons', text: '调试经验：出问题时先看什么' },
      { path: '/ebook/guide/integration-lessons', text: '集成经验：从接口到浏览器' },
      { path: '/ebook/guide/daily-digest', text: '每日 GitHub 报道装置：设计与运维' },
    ],
  },
  {
    text: '设计',
    items: [
      { path: '/ebook/design/01-visual-style-analysis', text: '视觉风格分析' },
      { path: '/ebook/design/02-design-system-recommendations', text: '设计系统建议' },
      { path: '/ebook/design/03-issues-and-fixes', text: '问题与修复' },
      { path: '/ebook/design/04-modification-plan', text: '修改方案' },
      { path: '/ebook/design/brand', text: '品牌规范' },
    ],
  },
  {
    text: '规划练习',
    items: [
      { path: '/ebook/exercises/stage-1', text: '练习 1 · 拆解阶段 2' },
      { path: '/ebook/exercises/stage-2', text: '练习 2 · 拆解阶段 3' },
      { path: '/ebook/exercises/stage-3', text: '练习 3 · 拆解阶段 4' },
      { path: '/ebook/exercises/stage-4', text: '练习 4 · 拆解阶段 5' },
      { path: '/ebook/exercises/stage-5', text: '练习 5 · 拆解阶段 6' },
      { path: '/ebook/exercises/stage-6', text: '练习 6 · 拆解阶段 7' },
      { path: '/ebook/exercises/stage-7', text: '练习 7 · 拆解阶段 8' },
      { path: '/ebook/exercises/stage-8', text: '练习 8 · 复盘与排期' },
    ],
  },
]

/** 集合里真实存在的 path 集合，用来给目录表标缺项 */
const indexed = computed(() => new Set(((docs.value ?? []) as DocRow[]).map((d) => d.path)))

const groups = computed(() =>
  GROUPS.map((g) => ({
    text: g.text,
    items: g.items.map((i) => ({ ...i, missing: !indexed.value.has(i.path) })),
  })),
)

const total = computed(() => docs.value?.length ?? 0)

/** 期望 29：30 个 md 里 index.md 是本页，其余 29 篇都是正文路由 */
const missingCount = computed(
  () => GROUPS.flatMap((g) => g.items).filter((i) => !indexed.value.has(i.path)).length,
)

// hero / features 的结构照 content/index.md 的 frontmatter 声明。
// 用真类型而不是 any：Content 3 的推导类型要等模块装好才有，
// 而这里唯一确定的事实是「VitePress 首页 frontmatter 长这样」，写下来就对了。
const homeDoc = computed(() => home.value as unknown as EbookHome | null)
const hero = computed(() => homeDoc.value?.hero ?? {})
const features = computed(() => homeDoc.value?.features ?? [])
const actions = computed(() =>
  (hero.value.actions ?? []).map((a) => ({
    text: a.text,
    to: EBOOK_BASE + a.link,
    // VitePress 的 theme: brand / alt 在这里对应 Nuxt UI 的 solid / outline
    variant: a.theme === 'alt' ? 'outline' : 'solid',
  })),
)

useSeoMeta({
  title: 'studyplan 全栈实战电子书 · 目录',
  description: () =>
    String(
      hero.value.tagline || '从零到上线，边做边学：Nuxt 4 + NestJS 11 + MongoDB 的全栈实战笔记。',
    ),
})
</script>

<template>
  <UContainer class="space-y-8 py-6 md:py-8">
    <!-- 页头：文案来自 content/index.md 的 hero frontmatter，不在这里重写 -->
    <BentoCard tone="brand">
      <p class="text-sm font-medium text-primary">{{ hero.name }}</p>
      <h1 class="mt-1 text-2xl font-bold text-highlighted">{{ hero.text }}</h1>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-toned">{{ hero.tagline }}</p>
      <div class="mt-5 flex flex-wrap gap-3">
        <UButton v-for="a in actions" :key="a.to" :to="a.to" :variant="a.variant" color="primary">
          {{ a.text }}
        </UButton>
      </div>
    </BentoCard>

    <!-- 5 组目录（顺序 = 学习顺序，不是文件顺序） -->
    <section class="space-y-6">
      <p class="text-sm text-muted">
        共 {{ total }} 篇正文（期望 29 篇：30 个 md 里 index.md 就是本页）
      </p>
      <!-- 缺项必须显形：静默少一条链接是最难被发现的内容事故 -->
      <UAlert
        v-if="missingCount"
        color="warning"
        variant="soft"
        icon="i-lucide-triangle-alert"
        :title="`目录里有 ${missingCount} 篇没被索引到，见下方标注的条目`"
      />

      <BentoCard v-for="g in groups" :key="g.text" as="section" tone="muted">
        <h2 class="text-lg font-semibold text-highlighted">
          {{ g.text }}<span class="ml-2 text-sm font-normal text-muted">{{ g.items.length }}</span>
        </h2>
        <ul class="mt-3 grid gap-2 sm:grid-cols-2">
          <li v-for="it in g.items" :key="it.path">
            <ULink
              v-if="!it.missing"
              :to="it.path"
              class="text-body-sm text-toned transition-colors hover:text-primary"
            >
              {{ it.text }}
            </ULink>
            <span v-else class="text-body-sm text-muted" :title="`集合里查不到 ${it.path}`">
              {{ it.text }}（未索引）
            </span>
          </li>
        </ul>
      </BentoCard>
    </section>

    <!-- features 四张卡：同样来自 index.md 的 frontmatter -->
    <section v-if="features.length" class="grid gap-4 sm:grid-cols-2">
      <BentoCard v-for="f in features" :key="f.title" as="section">
        <h3 class="text-base font-semibold text-highlighted">{{ f.title }}</h3>
        <p class="mt-1.5 text-sm leading-relaxed text-toned">{{ f.details }}</p>
      </BentoCard>
    </section>

    <!-- index.md 的正文（这个项目在做什么 / 你会学到什么 / 学习方式 / 一条纪律） -->
    <BentoCard v-if="home" as="section" tone="default">
      <div class="prose-post max-w-none">
        <ContentRenderer :value="home" />
      </div>
    </BentoCard>
  </UContainer>
</template>
