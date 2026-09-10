<script setup lang="ts">
/**
 * 首页 · 帖子流。
 *
 * 阶段 2 的版本用 mock 数据，但**所有交互都是真的**：
 * 标签筛选会真的重新查询、分页会真的追加、加载态会真的出现。
 * 唯一"假"的是数据的来源 —— 阶段 4 只换 store 里的一个函数。
 *
 * 三件事值得注意：
 *   1. 筛选条件同步到地址栏（?tag=Vue），这样筛选结果可分享、可前进后退；
 *   2. 用 `useAsyncData` 保证 SSR 时就把首屏帖子渲染好（对 SEO 与首屏体验都重要）；
 *   3. 三个状态（加载中 / 空结果 / 出错）都有专门界面，没有一个是"什么都不显示"。
 */
import { AlertCircle, FileText, PenLine, RefreshCw, ServerOff } from 'lucide-vue-next'

const postStore = usePostStore()
const route = useRoute()
const router = useRouter()

/**
 * 用 useAsyncData 包住首次加载：
 * 它会让这次数据获取发生在**服务端渲染阶段**，
 * 于是浏览器拿到的 HTML 里已经有帖子内容了，而不是先看到骨架再闪一下。
 */
await useAsyncData('post-list-initial', async () => {
  const fromUrl = typeof route.query.tag === 'string' ? route.query.tag : null
  if (fromUrl !== postStore.activeTag) {
    await postStore.selectTag(fromUrl)
  } else {
    await postStore.fetchList(true)
  }
  return postStore.items.length
})

/** 标签筛选：同时更新 store 与地址栏 */
const tagModel = computed<string | null>({
  get: () => postStore.activeTag,
  set: (tag) => {
    void postStore.selectTag(tag)
    void router.replace({ query: tag ? { tag } : {} })
  },
})

/** 浏览器前进 / 后退时，地址栏变了要跟着重新筛选 */
watch(
  () => route.query.tag,
  (value) => {
    const next = typeof value === 'string' ? value : null
    if (next !== postStore.activeTag) void postStore.selectTag(next)
  },
)

/** 后端连通性指示：在数据看起来"空"的时候，先排除"后端没开"这个可能 */
const apiBase = useRuntimeConfig().public.apiBase as string
const backendOnline = ref<boolean | null>(null)

onMounted(async () => {
  try {
    await $fetch(`${apiBase}/health`, { timeout: 3000 })
    backendOnline.value = true
  } catch {
    backendOnline.value = false
  }
})
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 sm:px-6">
    <!-- 页头 -->
    <section class="pt-10 pb-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            帖子流
          </h1>
          <p class="mt-1.5 text-[13.5px] text-slate-500 dark:text-slate-400">
            共
            <span class="font-medium text-slate-700 tabular-nums dark:text-slate-200">
              {{ postStore.total }}
            </span>
            篇文章 · 分享学习笔记与技术心得
          </p>
        </div>

        <!-- 后端连通状态 -->
        <div
          class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px]"
          :class="
            backendOnline === false
              ? 'border-amber-300/70 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400'
              : 'border-slate-200 bg-white text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400'
          "
        >
          <ServerOff v-if="backendOnline === false" :size="13" />
          <span v-else class="h-1.5 w-1.5 rounded-full bg-ai-500" />
          <span v-if="backendOnline === null">检测后端…</span>
          <span v-else-if="backendOnline">后端已连接</span>
          <span v-else>后端未启动（当前为本地数据）</span>
        </div>
      </div>

      <!-- 标签筛选条 -->
      <div class="mt-6">
        <TagFilter v-model="tagModel" :tags="postStore.availableTags" />
      </div>
    </section>

    <!-- 出错 -->
    <div
      v-if="postStore.error"
      class="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/30 dark:bg-rose-500/5"
    >
      <AlertCircle class="mt-0.5 shrink-0 text-rose-500" :size="18" />
      <div class="text-[13px] leading-6">
        <p class="font-medium text-rose-800 dark:text-rose-300">加载失败</p>
        <p class="mt-0.5 text-rose-700/80 dark:text-rose-300/70">{{ postStore.error }}</p>
      </div>
      <button
        type="button"
        class="ml-auto inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-rose-300 px-3 text-[12px] text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-500/40 dark:text-rose-300"
        @click="postStore.fetchList(true)"
      >
        <RefreshCw :size="13" />
        重试
      </button>
    </div>

    <!-- 帖子列表 -->
    <section v-else class="space-y-4">
      <!-- 首屏加载骨架：形状要和真实卡片一致，否则内容出现时会"跳一下" -->
      <template v-if="postStore.loading && postStore.items.length === 0">
        <div
          v-for="index in 4"
          :key="`skeleton-${index}`"
          class="animate-pulse rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-[#16161d]"
        >
          <div class="h-4 w-2/3 rounded bg-slate-200 dark:bg-white/10" />
          <div class="mt-3 h-3 w-full rounded bg-slate-100 dark:bg-white/5" />
          <div class="mt-2 h-3 w-4/5 rounded bg-slate-100 dark:bg-white/5" />
          <div class="mt-4 flex gap-2">
            <div class="h-5 w-16 rounded-full bg-slate-100 dark:bg-white/5" />
            <div class="h-5 w-20 rounded-full bg-slate-100 dark:bg-white/5" />
          </div>
        </div>
      </template>

      <!-- 空结果：一定要给出"下一步做什么"，而不是一片空白 -->
      <div
        v-else-if="postStore.items.length === 0"
        class="rounded-2xl border border-dashed border-slate-300 py-16 text-center dark:border-white/15"
      >
        <FileText class="mx-auto text-slate-300 dark:text-slate-600" :size="32" />
        <p class="mt-4 text-[14px] font-medium text-slate-600 dark:text-slate-300">
          {{ postStore.activeTag ? `「${postStore.activeTag}」标签下还没有文章` : '还没有任何文章' }}
        </p>
        <p class="mt-1.5 text-[13px] text-slate-400 dark:text-slate-500">
          {{ postStore.activeTag ? '换个标签看看，或者' : '来' }}写下第一篇
        </p>
        <NuxtLink
          to="/posts/new"
          class="mt-5 inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-500 px-4 text-[13px] font-medium text-white transition-colors hover:bg-brand-600"
        >
          <PenLine :size="14" />
          去写文章
        </NuxtLink>
      </div>

      <!-- 真实列表 -->
      <template v-else>
        <PostCard
          v-for="post in postStore.items"
          :key="post.id"
          :post="post"
          @toggle-like="postStore.toggleLike"
        />
      </template>
    </section>

    <!-- 加载更多 -->
    <div v-if="!postStore.error && postStore.items.length > 0" class="mt-8 flex justify-center">
      <button
        v-if="postStore.hasMore"
        type="button"
        class="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 text-[13.5px] font-medium text-slate-700 transition-all duration-200 hover:border-brand-300 hover:text-brand-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:border-brand-700"
        :disabled="postStore.loading"
        @click="postStore.loadMore"
      >
        <RefreshCw :size="15" :class="postStore.loading ? 'animate-spin' : ''" />
        {{ postStore.loading ? '加载中…' : '加载更多' }}
      </button>

      <p v-else class="text-[13px] text-slate-400 dark:text-slate-500">
        已经到底了 · 共 {{ postStore.total }} 篇
      </p>
    </div>
  </div>
</template>
