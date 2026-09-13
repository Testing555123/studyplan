<script setup lang="ts">
/**
 * GitHub 热门项目页。
 *
 * 三个值得注意的设计：
 *
 * 1. **筛选条件双向同步到地址栏**（`?range=7d&language=TypeScript`）。
 *    这样结果可分享、可前进后退 —— 榜单页尤其重要，
 *    用户很可能会把"最近一个月最火的 Rust 项目"这样的链接发给别人。
 *
 * 2. **首屏用 `useAsyncData` 在服务端取好**。
 *    这个页面的数据全靠后端代理（浏览器不直连 GitHub），
 *    走 SSR 能让用户直接看到卡片，而不是先看一屏骨架。
 *
 * 3. **三态齐全**：加载骨架 / 空结果 / 失败重试。
 *    后端还有第四种状态 —— `stale`（用了过期缓存），
 *    这里用琥珀色徽章如实告诉用户"数据可能不是最新"，
 *    而不是假装它是最新的。
 *
 * ── 组件选型 ──
 * 时间档用 `UButton` 循环，语言筛选复用 `TagFilter`：
 * 时间档需要"显示中文标签、提交 '7d' 这样的值"，
 * 而 TagFilter 的模型值与显示文本是同一个，处理不了这层映射；
 * 语言的显示文本与值恰好一致，交给 TagFilter 正合适。
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
</script>

<template>
  <UContainer>
    <!-- 页头 -->
    <section class="pt-10 pb-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight text-highlighted">GitHub 热门项目</h1>
          <p class="mt-1.5 text-body text-muted">
            按创建时间筛选，取 star 最高的项目 · 共
            <span class="font-medium text-toned tabular-nums">{{ result?.total ?? 0 }}</span>
            个
          </p>
        </div>

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
      </div>

      <!-- 时间档：必选其一，所以不用 TagFilter（它没有"无全部"以外的语义） -->
      <div class="mt-6 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

      <!-- 语言筛选：选项来自当前结果集，切换时间档后会自动更新 -->
      <div v-if="result && result.languages.length > 0" class="mt-3">
        <TagFilter v-model="languageModel" :tags="result.languages" />
      </div>
    </section>

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

    <!-- 项目网格 -->
    <section v-else-if="result">
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <RepoCard
          v-for="repo in result.items"
          :key="repo.id"
          :repo="repo"
          @ask="ai.askAboutRepo"
        />
      </div>

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
  </UContainer>
</template>
