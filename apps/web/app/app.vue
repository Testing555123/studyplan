<script setup lang="ts">
/**
 * 应用根组件，作为所有页面的最外层容器。
 *
 * 布局：左侧可折叠 AppSidebar + 右侧「顶栏 / 内容 / 页脚」三段式。
 * 用 <UApp> 包裹 Nuxt UI 的浮层上下文；<NuxtPage> 是文件路由出口。
 *
 * 桌面端侧栏宽度在 w-64 / w-20 间过渡（由 sidebarOpen 控制）；
 * 移动端侧栏收起为抽屉（mobileNavOpen）。
 *
 * 全局命令面板（⌘K 唤起）挂在这里：它是全站级能力，任何页面都能唤起。
 * 开关状态用 useState 共享，页头的搜索按钮也能打开同一个面板。
 */
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'
import type { TrendingResponse, PostListResponse } from '@studyplan/shared'

const api = useApi()

/* ────────────────────────────────────────────────────────────────
 * 站点级 SEO 兜底。
 *
 * 这里写的是**默认值**：任何页面如果自己没有声明 SEO 信息，
 * 就会落到这一层。而详情页会用同名 key 覆盖（unhead 里后注册的赢）。
 *
 * canonical 用 useRequestURL() 拿 host + path，再拼上显式声明的
 * siteUrl（容器内是明文 HTTP，用请求协议拼出来的是错的地址）。
 * ──────────────────────────────────────────────────────────────── */
const siteOrigin = useRuntimeConfig().public.siteUrl.replace(/\/+$/, '')
const requestUrl = useRequestURL()
const canonicalUrl = `${siteOrigin}${requestUrl.pathname}`

useHead({
  link: [{ rel: 'canonical', href: canonicalUrl }],
})

useSeoMeta({
  ogTitle: 'studyplan · 学习社区',
  ogDescription: '一个边做边学的全栈项目：分享你的学习笔记与技术心得。',
  ogImage: `${siteOrigin}/og-cover.png`,
  ogUrl: canonicalUrl,
  twitterImage: `${siteOrigin}/og-cover.png`,
})

/** 侧栏折叠态（桌面）与移动抽屉开关 */
const sidebarOpen = useState<boolean>('sidebar-open', () => true)
const mobileNavOpen = ref(false)

/** 命令面板开关：useState 保证 SSR 安全且跨组件共享 */
const commandOpen = useState<boolean>('command-palette-open', () => false)

// ⌘K / Ctrl+K 唤起全局搜索
defineShortcuts({
  meta_k: () => { commandOpen.value = !commandOpen.value },
})

const selected = ref<CommandPaletteItem | null>(null)

/**
 * 静态导航分组（命令面板）。
 * 抽成具名常量，初始状态与重建后的状态引用同一对象，类型天然收窄，
 * 避免严格索引检查下的 TS2322，也避免空数组时运行时炸。
 */
const NAV_GROUP: CommandPaletteGroup = {
  id: 'actions',
  label: '快捷导航',
  items: [
    { label: '首页', icon: 'i-lucide-home', to: '/' },
    { label: 'GitHub 热门项目', icon: 'i-lucide-trending-up', to: '/trending' },
    { label: '写文章', icon: 'i-lucide-pen-line', to: '/posts/new' },
  ],
}

const groups = ref<CommandPaletteGroup[]>([NAV_GROUP])

// 预拉取仓库与文章，作为可搜索条目（增强功能，失败不阻断正常使用）
onMounted(async () => {
  try {
    const [trending, posts] = await Promise.all([
      api.get<TrendingResponse>('/github/trending', { range: '7d' }),
      api.get<PostListResponse>('/posts', { page: 1, pageSize: 20 }),
    ])
    groups.value = [
      NAV_GROUP,
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
    <div class="flex min-h-screen bg-default">
      <!-- 桌面侧栏：宽度随折叠态在 w-64 / w-20 间过渡 -->
      <aside
        class="hidden shrink-0 overflow-hidden border-r border-default transition-[width] duration-200 sm:flex sm:flex-col"
        :class="sidebarOpen ? 'w-64' : 'w-20'"
      >
        <AppSidebar :open="sidebarOpen" />
      </aside>

      <!-- 移动端抽屉 -->
      <Teleport to="body">
        <Transition
          enter-active-class="transition-opacity duration-200 ease-out"
          enter-from-class="opacity-0"
          leave-active-class="transition-opacity duration-150 ease-in"
          leave-to-class="opacity-0"
        >
          <div v-if="mobileNavOpen" class="fixed inset-0 z-50 sm:hidden">
            <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="mobileNavOpen = false" />
            <aside class="absolute inset-y-0 left-0 w-64 border-r border-default bg-default shadow-xl">
              <AppSidebar :open="true" closable @close="mobileNavOpen = false" />
            </aside>
          </div>
        </Transition>
      </Teleport>

      <div class="flex min-w-0 flex-1 flex-col">
        <AppHeader
          :sidebar-open="sidebarOpen"
          @toggle-sidebar="sidebarOpen = !sidebarOpen"
          @toggle-mobile-nav="mobileNavOpen = true"
        />

        <main class="flex-1">
          <NuxtPage />
        </main>

        <AppFooter />

        <AiAssistant />
      </div>
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
