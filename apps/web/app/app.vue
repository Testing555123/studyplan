<script setup lang="ts">
/**
 * 应用根组件，作为所有页面的最外层容器。
 *
 * 三件事：把页面切成「页头 / 内容 / 页脚」三段，用 flex 让内容区撑满剩余高度
 * （页脚因此永远贴在底部，短页面也不会悬空）；用 <UApp> 包裹 Nuxt UI 的浮层上下文；
 * <NuxtPage> 则是文件路由出口，app/pages 下的每个文件都会渲染到这里。
 *
 * main 上的 pt-16 不能省：页头是 fixed 定位、不占文档流，不预留 4rem 上边距，
 * 首屏内容会被页头盖住。
 *
 * 全局命令面板（⌘K 唤起）挂在这里：它是全站级能力，任何页面都能唤起。
 * 开关状态用 useState 共享，页头的搜索按钮也能打开同一个面板。
 */
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'
import type { TrendingResponse, PostListResponse } from '@studyplan/shared'

const api = useApi()

/** 命令面板开关：useState 保证 SSR 安全且跨组件共享 */
const commandOpen = useState<boolean>('command-palette-open', () => false)

// ⌘K / Ctrl+K 唤起全局搜索
defineShortcuts({
  meta_k: () => { commandOpen.value = !commandOpen.value },
})

const selected = ref<CommandPaletteItem | null>(null)

/** 静态导航项 + 进入后预拉取的仓库/文章，统一作为可搜索条目 */
const groups = ref<CommandPaletteGroup[]>([
  {
    id: 'actions',
    label: '快捷导航',
    items: [
      { label: '帖子流', icon: 'i-lucide-home', to: '/' },
      { label: 'GitHub 热门项目', icon: 'i-lucide-trending-up', to: '/trending' },
      { label: '写文章', icon: 'i-lucide-pen-line', to: '/posts/new' },
    ],
  },
])

// 预拉取仓库与文章，作为可搜索条目（增强功能，失败不阻断正常使用）
onMounted(async () => {
  try {
    const [trending, posts] = await Promise.all([
      api.get<TrendingResponse>('/github/trending', { range: '7d' }),
      api.get<PostListResponse>('/posts', { page: 1, pageSize: 20 }),
    ])
    groups.value = [
      groups.value[0],
      {
        id: 'repos',
        label: 'GitHub 项目',
        items: trending.items.map((repo) => ({
          label: repo.fullName,
          icon: 'i-lucide-star',
          to: `/trending/${repo.ownerLogin}/${repo.name}`,
        })),
      },
      {
        id: 'posts',
        label: '文章',
        items: posts.items.map((post) => ({
          label: post.title,
          icon: 'i-lucide-file-text',
          to: `/posts/${post.id}`,
        })),
      },
    ]
  } catch {
    // 全局搜索是增强功能：拉取失败不影响主流程
  }
})
</script>

<template>
  <UApp>
    <!--
      `bg-default` 是 Nuxt UI 的语义背景色：亮色下是浅灰白，暗色下自动切深色，
      不用再写两套类名，全站口径统一。

      AI 助手挂在这里而不是某个页面里：它是全站级能力，任何页面都能唤起。
    -->
    <div class="flex min-h-screen flex-col bg-default">
      <AppHeader />

      <main class="flex-1 pt-16">
        <NuxtPage />
      </main>

      <AppFooter />

      <AiAssistant />
    </div>

    <!-- 全局命令面板：⌘K 或页头搜索按钮唤起，搜索项目 / 文章 / 快捷跳转 -->
    <UModal v-model:open="commandOpen" :ui="{ content: 'sm:max-w-2xl' }">
      <template #content>
        <UCommandPalette
          v-model="selected"
          :groups="groups"
          placeholder="搜索项目、文章或跳转…"
          @update:open="commandOpen = $event"
          @update:model-value="commandOpen = false"
        />
      </template>
    </UModal>
  </UApp>
</template>
