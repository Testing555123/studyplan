<script setup lang="ts">
/**
 * GitHub 热门项目页，三个设计点：
 *
 * 1. 筛选条件双向同步到地址栏（`?range=7d&language=TypeScript`），
 *    结果可分享、可前进后退——榜单页尤其重要，用户常把「最近一个月最火的 Rust 项目」这类链接发给别人。
 *
 * 2. 首屏用 `useAsyncData` 在服务端取好：数据全靠后端代理（浏览器不直连 GitHub），
 *    走 SSR 让用户直接看到卡片，而不是先一屏骨架。
 *
 * 3. 三态齐全：加载骨架 / 空结果 / 失败重试。后端还有第四种状态 `stale`（用了过期缓存），
 *    这里用琥珀色徽章如实告诉用户「数据可能不是最新」，而不是假装它是最新的。
 *
 * 组件选型：时间档用 `UButton` 循环，语言筛选复用 `TagFilter`。
 * 时间档需要「显示中文标签、提交 '7d' 这样的值」，而 TagFilter 的模型值与显示文本是同一个，
 * 处理不了这层映射；语言的显示文本与值恰好一致，交给 TagFilter 正合适。
 *
 * ⚠️ 文件名必须是 `index.vue`，**不能**叫 `trending.vue`。
 *
 * 这是本项目踩过的一次真实的坑：Nuxt 的文件路由里，**同名文件 + 同名目录会被解释成父子路由**。
 * 一旦把它写成 `pages/trending.vue`，它就会变成 `pages/trending/[owner]/[repo].vue`（详情页）的
 * **父级组件**，而父级组件里必须有 `<NuxtPage />` 才有子路由的渲染出口 —— 它没有。
 * 结果极其具有迷惑性：点击项目卡片后 **URL 确实变成了详情页地址**，
 * 但屏幕上的 DOM 仍然是这份列表（父级还在，子级无出口），
 * 用户看到的就是"点了没反应"。SSR 的 HTML 一切正常，控制台也没有报错，
 * 只有那个链接上多出来的 `router-link-exact-active` 类暴露了真相。
 *
 * 所以：只要这个目录下还有子路由，列表页就必须是 `index.vue` ——
 * 这样 `/trending` 与 `/trending/:owner/:repo` 才是**同级叶子路由**，各自独立渲染。
 * 反过来，给 `trending.vue` 补一个 `<NuxtPage />` 是**错误**的修法：
 * 那会把详情页嵌套进列表页的界面里。
 */
import { ExternalLink } from 'lucide-vue-next'
import { DEFAULT_TRENDING_RANGE, TRENDING_RANGES, isTrendingRange } from '@studyplan/shared'
import type { TrendingRange, TrendingResponse } from '@studyplan/shared'

const route = useRoute()
const router = useRouter()
const api = useApi()
const ai = useAiAssistant()

/** 时间档：必选其一，没有"全部"这个概念 */
const range = ref<TrendingRange>(
  isTrendingRange(route.query.range) ? route.query.range : DEFAULT_TRENDING_RANGE,
)

/** 语言：null 表示全部 */
const language = ref<string | null>(
  typeof route.query.language === 'string' ? route.query.language : null,
)

/**
 * 取数。
 *
 * 第一个参数用**函数**而不是固定字符串：这样切换筛选条件时
 * key 会变，Nuxt 才会认为是不同的请求并各自缓存。
 * 若写成固定的 'trending'，切档后可能拿到上一档的缓存结果。
 */
const { data, pending, error, refresh } = await useAsyncData(
  () => `trending-${range.value}-${language.value ?? 'all'}`,
  () =>
    api.get<TrendingResponse>('/github/trending', {
      range: range.value,
      // 后端把空串与不传都视为"全部"，这里统一不传
      ...(language.value ? { language: language.value } : {}),
    }),
  { watch: [range, language] },
)

const result = computed(() => data.value ?? null)

const { ensure } = useRepoIntros()

/**
 * 为当前列表请求 AI 简介。
 *
 * **只在客户端做**：生成一条简介要真调一次模型（实测 20-40 秒），
 * 放进 SSR 等于让首屏干等 —— 而这一屏真正该先出来的是项目卡片本身。
 *
 * 生成是异步且限量的，所以卡片会先把官方简介显示出来，
 * 润色版就绪后再被替换掉，用户看到的是内容逐步变好，而不是一个转圈。
 */
watch(
  () => result.value?.items,
  (items) => {
    if (!items || items.length === 0) return
    if (!import.meta.client) return
    void ensure(items)
  },
  { immediate: true },
)

/** 语言筛选：与地址栏同步 */
const languageModel = computed<string | null>({
  get: () => language.value,
  set: (value) => {
    language.value = value
  },
})

/** 任何筛选变化都写回地址栏，保证链接可分享 */
watch([range, language], () => {
  const query: Record<string, string> = { range: range.value }
  if (language.value) query.language = language.value
  void router.replace({ query })
})

/** 浏览器前进/后退时跟着变 */
watch(
  () => route.query,
  (query) => {
    const nextRange = isTrendingRange(query.range) ? query.range : DEFAULT_TRENDING_RANGE
    const nextLanguage = typeof query.language === 'string' ? query.language : null
    if (nextRange !== range.value) range.value = nextRange
    if (nextLanguage !== language.value) language.value = nextLanguage
  },
)

/** 数据新鲜度文案。stale 时明确提示"可能不是最新" */
const freshnessText = computed(() => {
  const current = result.value
  if (!current) return '加载中…'
  const relative = formatRelativeTime(current.fetchedAt)
  return current.stale ? `${relative}更新（可能不是最新）` : `${relative}更新`
})

/** 移动端筛选抽屉：受控挂载，避免 v-model 不渲染的坑（见 AiAssistant.vue） */
const filtersOpen = ref(false)
</script>

<template>
  <UContainer>
    <!-- 页头：用 UPageHeader 统一页头节奏（eyebrow / 主标题 / 描述 / 右侧操作），替代手搓 section -->
    <UPageHeader
      headline="GitHub 热门"
      title="GitHub 热门项目"
    >
      <template #description>
        按创建时间筛选，取 star 最高的项目 · 共
        <span class="font-medium text-toned tabular-nums">{{ result?.total ?? 0 }}</span>
        个
      </template>
      <template #links>
        <!-- 数据新鲜度：过期缓存会变成琥珀色，如实告知 -->
        <UBadge
          v-if="result"
          :color="result.stale ? 'warning' : 'neutral'"
          variant="subtle"
          size="md"
          :icon="result.stale ? 'i-lucide-alert-triangle' : 'i-lucide-check-circle-2'"
        >
          {{ freshnessText }}
        </UBadge>
      </template>
    </UPageHeader>

    <!-- 桌面端筛选：时间档 + 语言 -->
      <div class="mt-7 hidden items-start gap-6 sm:flex">
        <div>
          <p class="mb-2 text-eyebrow font-medium uppercase tracking-wider text-muted">时间范围</p>
          <div class="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <UButton
              v-for="item in TRENDING_RANGES"
              :key="item.value"
              size="xs"
              :variant="range === item.value ? 'solid' : 'outline'"
              :color="range === item.value ? 'primary' : 'neutral'"
              class="shrink-0 rounded-full"
              @click="range = item.value"
            >
              {{ item.label }}
            </UButton>
          </div>
        </div>

        <div v-if="result && result.languages.length > 0" class="min-w-0 flex-1">
          <p class="mb-2 text-eyebrow font-medium uppercase tracking-wider text-muted">语言</p>
          <TagFilter v-model="languageModel" :tags="result.languages" />
        </div>
      </div>

      <!-- 移动端：筛选入口（滑出抽屉） -->
      <div class="mt-7 sm:hidden">
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-sliders-horizontal"
          @click="filtersOpen = true"
        >
          筛选
        </UButton>
      </div>
    </section>

    <!--
      每日推荐区块：放在榜单之上。
      它同时承担两件事 —— 展示今天推了哪个项目，以及**说明为什么没有**。
      后者更重要：这个装置很可能"什么都没做却不报错"。
    -->
    <DailyDigestBanner />

    <!-- 出错 -->
    <section v-if="error" class="pb-10">
      <UAlert
        color="error"
        variant="soft"
        icon="i-lucide-alert-circle"
        title="榜单加载失败"
        :description="(error as Error).message"
      />
      <UButton
        class="mt-3"
        size="sm"
        color="error"
        variant="outline"
        icon="i-lucide-refresh-cw"
        @click="refresh()"
      >
        重试
      </UButton>
    </section>

    <!-- 加载骨架：形状与卡片一致，避免内容出现时跳动 -->
    <section v-else-if="pending && !result">
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <UCard v-for="index in 6" :key="`skeleton-${index}`">
          <USkeleton class="h-5 w-1/3" />
          <USkeleton class="mt-3 h-4 w-2/3" />
          <USkeleton class="mt-2 h-3 w-full" />
          <USkeleton class="mt-2 h-3 w-4/5" />
          <div class="mt-4 flex gap-3">
            <USkeleton class="h-4 w-16" />
            <USkeleton class="h-4 w-12" />
          </div>
        </UCard>
      </div>
    </section>

    <!-- 空结果 -->
    <UEmpty
      v-else-if="result && result.items.length === 0"
      icon="i-lucide-search-x"
      title="这个条件下没有找到项目"
      description="换个时间范围或语言试试 —— 时间越短、语言越小众，结果通常越少"
    />

    <!-- 项目网格：用 UPageGrid 统一响应式列数与间距，错落淡入（stagger + fade-up）沿用既有动画 -->
    <section v-else-if="result">
      <UPageGrid
        :ui="{ base: 'relative grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4' }"
        class="stagger"
      >
        <TransitionGroup name="fade-up">
          <div
            v-for="(repo, index) in result.items"
            :key="repo.id"
            :style="{ '--i': index }"
            class="flex"
          >
            <RepoCard
              class="h-full flex-1"
              :repo="repo"
              @ask="ai.askAboutRepo"
            />
          </div>
        </TransitionGroup>
      </UPageGrid>

      <!-- 数据来源说明：榜单口径必须交代清楚，否则容易被误读成"涨粉最快榜" -->
      <p class="mt-8 flex items-center justify-center gap-1.5 text-caption text-dimmed">
        数据来源：GitHub Search API · 统计口径为该时间区间内<b>新建</b>项目中 star 最高者
        <ULink
          to="https://docs.github.com/en/rest/search/search"
          target="_blank"
          class="inline-flex items-center gap-1 text-primary hover:underline"
        >
          接口文档
          <ExternalLink :size="11" />
        </ULink>
      </p>
    </section>

    <!-- 移动端筛选抽屉 -->
    <USlideover
      v-if="filtersOpen"
      :open="true"
      side="left"
      :ui="{ content: 'w-full sm:max-w-sm' }"
      @update:open="(value: boolean) => { if (!value) filtersOpen = false }"
    >
      <template #header>
        <p class="text-body-sm font-semibold text-highlighted">筛选</p>
      </template>

      <template #body>
        <div class="space-y-6">
          <div>
            <p class="mb-2 text-eyebrow font-medium uppercase tracking-wider text-muted">时间范围</p>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="item in TRENDING_RANGES"
                :key="item.value"
                size="xs"
                :variant="range === item.value ? 'solid' : 'outline'"
                :color="range === item.value ? 'primary' : 'neutral'"
                class="rounded-full"
                @click="range = item.value"
              >
                {{ item.label }}
              </UButton>
            </div>
          </div>

          <div v-if="result && result.languages.length > 0">
            <p class="mb-2 text-eyebrow font-medium uppercase tracking-wider text-muted">语言</p>
            <TagFilter v-model="languageModel" :tags="result.languages" />
          </div>
        </div>
      </template>

      <template #footer>
        <UButton block color="primary" @click="filtersOpen = false">完成</UButton>
      </template>
    </USlideover>
  </UContainer>
</template>
