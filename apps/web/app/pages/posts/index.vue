<script setup lang="ts">
/**
 * 帖子流页面（/posts）。
 *
 * 从首页迁出的独立列表页：筛选条件同步到地址栏（?tag=Vue），结果可分享、可前进后退；
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
/**
 * 从地址栏解析出标签集合。
 * 兼容两种历史写法：`?tags=Vue&tags=React`（多标签）与 `?tags=Vue,React`（逗号串），
 * 以及更早的单标签 `?tag=Vue`，保证老分享链接依然生效。
 */
function tagsFromQuery(): string[] {
  const raw = route.query.tags ?? route.query.tag
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === 'string')
  if (typeof raw === 'string') return raw ? raw.split(',').map((t) => t.trim()).filter(Boolean) : []
  return []
}

await useAsyncData('post-list-initial', async () => {
  const fromUrl = tagsFromQuery()
  const current = postStore.selectedTags
  if (fromUrl.join(',') !== current.join(',')) {
    await postStore.setTags(fromUrl)
  } else {
    await postStore.fetchList(true)
  }
  return postStore.items.length
})

/** 标签筛选：同时更新 store 与地址栏 */
const tagModel = computed<string[]>({
  get: () => postStore.selectedTags,
  set: (tags) => {
    void postStore.setTags(tags)
    void router.replace({ query: tags.length ? { tags } : {} })
  },
})

const toast = useToast()

/** 点赞反馈：乐观更新后给轻提示，失败（store 内部已吞掉）保持静默 */
function onToggleLike(postId: string): void {
  const willLike = !postStore.isLiked(postId)
  postStore.toggleLike(postId)
  toast.add({
    title: willLike ? '已点赞' : '已取消点赞',
    icon: willLike ? 'i-lucide-heart' : 'i-lucide-heart-off',
    color: willLike ? 'error' : 'neutral',
    duration: 2000,
  })
}

/** 分页：与 postStore.page 双向同步，跳转交由 goToPage 处理 */
const page = computed<number>({
  get: () => postStore.page,
  set: (value) => { void postStore.goToPage(value) },
})

/** 浏览器前进 / 后退时，地址栏变了要跟着重新筛选 */
watch(
  () => route.query,
  () => {
    const next = tagsFromQuery()
    if (next.join(',') !== postStore.selectedTags.join(',')) void postStore.setTags(next)
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
    <!-- 页头：UPageHeader 统一节奏，替代手搓 section -->
    <UPageHeader
      headline="学习社区"
      title="帖子流"
    >
      <template #description>
        共
        <span class="font-medium text-toned tabular-nums">{{ postStore.total }}</span>
        篇文章 · 分享学习笔记与技术心得
      </template>
      <template #links>
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
      </template>
    </UPageHeader>

    <!-- 标签筛选条：包进卡片外壳，与趋势页筛选条同位置同语义 -->
    <div class="card-surface mt-7">
      <TagFilter v-model="tagModel" :tags="postStore.availableTags" multiple />
    </div>

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
    <section v-else>
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
        :title="postStore.selectedTags.length ? `「${postStore.selectedTags.join('、')}」标签下还没有文章` : '还没有任何文章'"
        :description="
          postStore.selectedTags.length ? '换个标签组合看看，或者写下第一篇' : '来写下第一篇学习笔记吧'
        "
      >
        <template #actions>
          <UButton to="/posts/new" icon="i-lucide-pen-line">去写文章</UButton>
        </template>
      </UEmpty>

      <!-- 真实列表：错落淡入（stagger + fade-up），reduced-motion 下由全局媒体查询降级 -->
      <TransitionGroup v-else name="fade-up" tag="div" class="stagger space-y-4">
        <div
          v-for="(post, index) in postStore.items"
          :key="post.id"
          :style="{ '--i': index }"
        >
          <PostCard
            :post="post"
            @toggle-like="onToggleLike"
          />
        </div>
      </TransitionGroup>
    </section>

    <!-- 分页：用 UPagination 替代"加载更多"，可直达任意页 -->
    <div v-if="!postStore.error && postStore.items.length > 0" class="mt-8 flex flex-col items-center gap-3">
      <UPagination
        v-if="postStore.total > postStore.pageSize"
        v-model:page="page"
        :total="postStore.total"
        :items-per-page="postStore.pageSize"
        :sibling-count="1"
        show-edges
      />

      <p class="text-body-sm text-muted">
        共 {{ postStore.total }} 篇
      </p>
    </div>
  </UContainer>
</template>
