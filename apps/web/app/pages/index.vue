<script setup lang="ts">
/**
 * 首页 · 帖子流。
 *
 * 三点：筛选条件同步到地址栏（?tag=Vue），结果可分享、可前进后退；
 * 首屏用 `useAsyncData` 在服务端渲染好帖子，对 SEO 和首屏体验都重要；
 * 加载中 / 空结果 / 出错三态都有专门界面，不会「什么都不显示」。
 *
 * 容器用 `UContainer`，提示用 `UAlert`，空态用 `UEmpty`，骨架用 `USkeleton`，按钮用 `UButton`，
 * 文字颜色用语义类（`text-highlighted` / `text-muted` / `text-toned`），不必再为每个颜色写 `dark:` 变体。
 * 间距、flex、网格这类布局类 Nuxt UI 不提供，照常保留。
 */
import { ServerOff } from 'lucide-vue-next'

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
  <UContainer>
    <!-- 页头 -->
    <section class="pt-10 pb-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-display font-semibold tracking-tight text-highlighted">帖子流</h1>
          <p class="mt-1.5 text-body text-muted">
            共
            <span class="font-medium text-toned tabular-nums">{{ postStore.total }}</span>
            篇文章 · 分享学习笔记与技术心得
          </p>
        </div>

        <!-- 后端连通状态 -->
        <UBadge
          :color="backendOnline === false ? 'warning' : 'neutral'"
          variant="subtle"
          size="md"
        >
          <template #leading>
            <ServerOff v-if="backendOnline === false" :size="13" />
            <span v-else class="h-1.5 w-1.5 rounded-full bg-success" />
          </template>
          <span v-if="backendOnline === null">检测后端…</span>
          <span v-else-if="backendOnline">后端已连接</span>
          <span v-else>后端未启动（当前为本地数据）</span>
        </UBadge>
      </div>

      <!-- 标签筛选条 -->
      <div class="mt-6">
        <TagFilter v-model="tagModel" :tags="postStore.availableTags" />
      </div>
    </section>

    <!-- 出错 -->
    <section v-if="postStore.error" class="pb-6">
      <UAlert
        color="error"
        variant="soft"
        icon="i-lucide-alert-circle"
        title="加载失败"
        :description="postStore.error"
      />
      <UButton
        class="mt-3"
        size="sm"
        color="error"
        variant="outline"
        icon="i-lucide-refresh-cw"
        @click="postStore.fetchList(true)"
      >
        重试
      </UButton>
    </section>

    <!-- 帖子列表 -->
    <section v-else class="space-y-4">
      <!-- 首屏加载骨架：形状要和真实卡片一致，否则内容出现时会"跳一下" -->
      <template v-if="postStore.loading && postStore.items.length === 0">
        <UCard v-for="index in 4" :key="`skeleton-${index}`">
          <USkeleton class="h-4 w-2/3" />
          <USkeleton class="mt-3 h-3 w-full" />
          <USkeleton class="mt-2 h-3 w-4/5" />
          <div class="mt-4 flex gap-2">
            <USkeleton class="h-5 w-16 rounded-full" />
            <USkeleton class="h-5 w-20 rounded-full" />
          </div>
        </UCard>
      </template>

      <!-- 空结果：一定要给出"下一步做什么"，而不是一片空白 -->
      <UEmpty
        v-else-if="postStore.items.length === 0"
        icon="i-lucide-file-text"
        :title="postStore.activeTag ? `「${postStore.activeTag}」标签下还没有文章` : '还没有任何文章'"
        :description="
          postStore.activeTag ? '换个标签看看，或者写下第一篇' : '来写下第一篇学习笔记吧'
        "
      >
        <template #actions>
          <UButton to="/posts/new" icon="i-lucide-pen-line">去写文章</UButton>
        </template>
      </UEmpty>

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
      <UButton
        v-if="postStore.hasMore"
        size="lg"
        color="neutral"
        variant="outline"
        loading-auto
        @click="postStore.loadMore"
      >
        加载更多
      </UButton>

      <p v-else class="text-body-sm text-muted">
        已经到底了 · 共 {{ postStore.total }} 篇
      </p>
    </div>
  </UContainer>
</template>
