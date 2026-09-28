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

// 底部「学习进度」不再写死 42%：与路线页共用同一份 stages 与同一个进度算法
const { progress } = useRoadmapProgress()

const links = [
  { label: '首页', description: '学习概览', to: '/', icon: 'i-lucide-home' },
  { label: '帖子流', description: '监视最新讨论', to: '/posts', icon: 'i-lucide-message-square-text' },
  { label: '智能搜索', description: '语义检索与问全书', to: '/search', icon: 'i-lucide-sparkles' },
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
    <div class="flex h-[var(--layout-header-h)] items-center gap-2 border-b border-default px-5">
      <span
        class="grid h-9 w-9 shrink-0 place-items-center rounded-card bg-primary text-[var(--color-on-primary)] [box-shadow:var(--elevation-panel)]"
      >
        <UIcon name="i-lucide-sparkles" class="size-[var(--icon-md)]" />
      </span>
      <span v-if="open" class="flex min-w-0 flex-col leading-none">
        <span class="text-subtitle font-semibold tracking-tight text-highlighted">studyplan</span>
        <span class="mt-0.5 truncate text-eyebrow text-muted">学习 · 技术分享</span>
      </span>
    </div>

    <div class="flex flex-1 flex-col px-3 py-5">
      <!-- 原为硬编码的 11px 字号与 0.18em 字距，改用字阶与字距令牌（视觉值不变） -->
      <p
        v-if="open"
        class="px-[var(--layout-sidebar-gutter)] text-eyebrow font-semibold uppercase tracking-eyebrow text-muted"
      >
        学习工作区
      </p>

      <!--
        折叠态只剩图标、没有可见文字，必须补 aria-label，
        否则屏幕阅读器与键盘用户读不出这四个导航项分别是什么。
        展开态有可见文字，交给内容本身，不再叠加 aria-label。
      -->
      <nav class="mt-3 space-y-1" :class="open ? '' : 'flex flex-col items-center'">
        <UButton
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          block
          :variant="isActive(link.to) ? 'solid' : 'ghost'"
          :icon="link.icon"
          size="md"
          :class="[
            // 覆写 UButton 内建的 px-2.5，让导航项与下方进度卡共用同一条左边界
            'px-[var(--layout-sidebar-gutter)]',
            open ? 'justify-start' : 'justify-center',
          ]"
          :aria-label="open ? undefined : link.label"
          @click="closable && emit('close')"
        >
          <span v-if="open" class="min-w-0 text-left">
            <span class="block text-body-sm font-medium">{{ link.label }}</span>
            <!--
              sub-label 颜色必须分选中式讨论，不能一律写死 text-muted：
              · 未选中（ghost）：text-muted 在画布上≈ 4.8:1，达标（旧版曾叠
                opacity-70 把它压到 4.5 以下，所以这里不叠）。
              · 选中（solid 主色底）：text-muted 不会随背景翻转，#a3adb9 压在
                青色 #22d3ee 上只有 1.26:1、几乎看不见（用户反馈「看不清」）。
                改为继承 UButton 的反色标题（与上行 label 同源）、只降不透明度，
                两种主题下都能跟着主色底自动取到对比足够的深 / 浅字。
            -->
            <span
              class="block truncate text-caption"
              :class="isActive(link.to) ? 'opacity-80' : 'text-muted'"
            >{{ link.description }}</span>
          </span>
        </UButton>
      </nav>

      <!-- 底部学习进度卡（折叠时隐藏） -->
      <!-- 进度面板改用 UCard：边框与底色交给 variant，内距交给 ui，不再手刻 -->
      <!--
        ⚠️ UCard 的 body 预设是 `p-4 sm:p-6` —— 只覆写 `p-*` 的话，
        螢幕 ≥640px 时 `sm:p-6` 仍会生效，卡片内容又会比导航项多 8px。
        所以两个断点都要指向同一个 gutter，否则「对齐」只在小萤幕成立。
      -->
      <!--
        root 显式指定 bg-elevated（L1 白）：soft 变体默认是 bg-elevated/50，
        半透明白落在灰画布上会稀成一片浅雾，看不出这是一张卡。
        侧栏容器本身已是画布灰，所以这里必须是一整块实心白才拉得开。
      -->
      <UCard
        v-if="open"
        variant="soft"
        class="mt-auto"
        :ui="{
          root: 'bg-elevated',
          body: 'p-[var(--layout-sidebar-gutter)] sm:p-[var(--layout-sidebar-gutter)]',
        }"
      >
        <div class="flex items-center gap-2 text-body-sm font-semibold text-highlighted">
          <UIcon name="i-lucide-book-open" class="size-[var(--icon-sm)] text-primary" />
          全栈学习进度
        </div>
        <div class="mt-3 flex items-center justify-between text-caption">
          <span class="text-muted">当前路线</span>
          <!-- 进度不再写死：由共享的 computeRoadmapProgress 从同一份 stages 算出 -->
          <span class="font-semibold text-highlighted">{{ progress.percent }}%</span>
        </div>
        <div class="mt-2 h-1.5 overflow-hidden rounded-pill bg-muted">
          <div class="h-full rounded-pill bg-primary" :style="{ width: progress.percent + '%' }" />
        </div>
        <NuxtLink
          to="/roadmap"
          class="mt-3 block text-caption font-medium text-primary hover:underline"
          @click="closable && emit('close')"
        >
          继续学习路线 →
        </NuxtLink>
      </UCard>
    </div>
  </div>
</template>
