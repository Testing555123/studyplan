<script setup lang="ts">
/**
 * 学习路线页：用 UTimeline 把帖子按时间串成一条成长轨迹。
 *
 * 数据直接复用 postStore（列表接口已经按时间返回），进入时若本地还没有
 * 帖子就拉一页；后端没起来则落到空态。每条以「第一个标签」决定图标，
 * 契合「studyplan」把零散阅读沉淀成路线的主题。
 */
const postStore = usePostStore()

/** 进入即拉取帖子（本地无数据时才拉，避免重复覆盖） */
onMounted(() => {
  if (postStore.items.length === 0) void postStore.fetchList(true)
})

const dateFmt = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })

/** 标签 → lucide 图标：取第一个标签决定色块图标，命中不了就用通用文档图标 */
function tagIcon(tags: string[]): string {
  const map: Record<string, string> = {
    JavaScript: 'i-lucide-file-code-2',
    TypeScript: 'i-lucide-file-code-2',
    Vue: 'i-lucide-boxes',
    React: 'i-lucide-atom',
    'Node.js': 'i-lucide-server',
    Python: 'i-lucide-code',
    CSS: 'i-lucide-palette',
    Rust: 'i-lucide-cog',
    Go: 'i-lucide-bolt',
  }
  return (tags[0] && map[tags[0]]) || 'i-lucide-file-text'
}

/** 按创建时间倒序，转成时间线条目；用 any[] 兼容 TimelineItem 的宽松结构 */
const items = computed<any[]>(() =>
  [...postStore.items]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((post) => ({
      date: dateFmt.format(new Date(post.createdAt)),
      title: post.title,
      description: post.summary || post.content.slice(0, 80),
      icon: tagIcon(post.tags),
    })),
)
</script>

<template>
  <UContainer class="py-8 sm:py-12">
    <UPageHeader
      headline="学习足迹"
      title="学习路线"
      description="按时间串起你读过、写过的每一篇，看见自己的成长轨迹。"
    />

    <section class="mt-8">
      <!-- 首屏骨架 -->
      <UCard v-if="postStore.loading && postStore.items.length === 0">
        <div class="flex flex-col gap-4">
          <USkeleton v-for="n in 4" :key="n" class="h-16 w-full" />
        </div>
      </UCard>

      <!-- 空态：后端未起或无帖子 -->
      <UEmpty
        v-else-if="postStore.items.length === 0"
        icon="i-lucide-route"
        title="还没有学习足迹"
        description="去帖子流读点或写一篇，这里就会串成一条时间线。"
      />

      <!-- 时间线：最新在上 -->
      <UTimeline v-else :items="items" size="lg" />
    </section>
  </UContainer>
</template>
