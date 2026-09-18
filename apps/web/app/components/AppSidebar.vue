<script setup lang="ts">
/**
 * 左侧可折叠导航栏，仿照 v0 原型的 SidebarNav。
 *
 * - 桌面端由 app.vue 当作静态 aside 渲染，宽度随折叠态在 w-64 / w-20 间过渡；
 *   这里只负责内部内容，靠 `open` 决定显示图标 + 文字，还是仅图标。
 * - 移动端由 app.vue 用抽屉包裹，此时 `open` 恒为 true，`closable` 控制点击后关闭抽屉。
 *
 * 导航项用 UButton 自管激活态：激活 = solid 主色，未激活 = ghost；
 * 仅在布局/间距处保留少量 Tailwind 工具类，其余走 Nuxt UI 语义色与组件。
 */
const props = withDefaults(defineProps<{
  /** 是否展开：false 时只显示图标 */
  open?: boolean
  /** 移动抽屉场景：点击导航后通知父组件关闭 */
  closable?: boolean
}>(), {
  open: true,
  closable: false,
})

const emit = defineEmits<{ close: [] }>()

const route = useRoute()

const links = [
  { label: '首页', description: '学习概览', to: '/', icon: 'i-lucide-home' },
  { label: '帖子流', description: '监视最新讨论', to: '/posts', icon: 'i-lucide-message-square-text' },
  { label: '全栈学习路线', description: '从基础到上线', to: '/roadmap', icon: 'i-lucide-route' },
  { label: 'GitHub 热门', description: '探索开源项目', to: '/trending', icon: 'i-lucide-github' },
]

function isActive(to: string): boolean {
  if (to === '/') return route.path === '/'
  return route.path.startsWith(to)
}
</script>

<template>
  <div class="flex h-full flex-col bg-default">
    <!-- 品牌区 -->
    <div class="flex h-16 items-center gap-2 border-b border-default px-5">
      <span class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-white shadow-sm">
        <UIcon name="i-lucide-sparkles" :size="18" />
      </span>
      <span v-if="open" class="flex min-w-0 flex-col leading-none">
        <span class="text-subtitle font-semibold tracking-tight text-highlighted">studyplan</span>
        <span class="mt-0.5 truncate text-eyebrow text-muted">学习 · 技术分享</span>
      </span>
    </div>

    <div class="flex flex-1 flex-col px-3 py-5">
      <p v-if="open" class="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        学习工作区
      </p>

      <nav class="mt-3 space-y-1" :class="open ? '' : 'flex flex-col items-center'">
        <UButton
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          block
          :variant="isActive(link.to) ? 'solid' : 'ghost'"
          :icon="link.icon"
          size="md"
          :class="open ? 'justify-start' : 'justify-center'"
          @click="closable && emit('close')"
        >
          <span v-if="open" class="min-w-0 text-left">
            <span class="block text-sm font-medium">{{ link.label }}</span>
            <span class="block truncate text-xs opacity-70">{{ link.description }}</span>
          </span>
        </UButton>
      </nav>

      <!-- 底部学习进度卡（折叠时隐藏） -->
      <div v-if="open" class="mt-auto rounded-2xl border border-default bg-muted/60 p-4">
        <div class="flex items-center gap-2 text-sm font-semibold text-highlighted">
          <UIcon name="i-lucide-book-open" :size="16" class="text-primary" />
          全栈学习进度
        </div>
        <div class="mt-3 flex items-center justify-between text-xs">
          <span class="text-muted">当前路线</span>
          <span class="font-semibold text-highlighted">42%</span>
        </div>
        <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div class="h-full w-[42%] rounded-full bg-primary" />
        </div>
        <NuxtLink
          to="/roadmap"
          class="mt-3 block text-xs font-medium text-primary hover:underline"
          @click="closable && emit('close')"
        >
          继续学习路线 →
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
