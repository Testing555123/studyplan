<script setup lang="ts">
/**
 * 全局吸顶导航栏。
 *
 * ── Nuxt UI 化之后 ──
 * 外壳改用 `UHeader`（自带 `UContainer` 居中、明暗适配与移动端菜单机制），
 * 导航项改用 `UNavigationMenu`，右侧操作区用 `UButton` / `UDropdownMenu`。
 *
 * 于是圆角、边框、hover、焦点环这些**每个交互元素都要有的东西**
 * 全部由组件库统一提供，这里不再维护 `.glass-bar` / `.nav-link` 那套自定义 CSS，
 * 也不再需要为每个颜色写 `dark:` 变体 —— 语义类（`text-highlighted`、
 * `from-primary-500` …）会自动跟着明暗模式走。
 *
 * 保留的两处 Tailwind 都是**布局类**：`fixed / z-50 / h-16` 定位，
 * 以及内部的 `flex / gap-*`。Nuxt UI 不提供布局原子类，这部分按约定照常使用。
 *
 * 关于图标：`lucide-vue-next` 的图标是普通 Vue 组件，
 * **不在 Nuxt 的自动导入范围内**，必须逐个显式 import。
 * 漏掉 import 不会报错，只会静默渲染不出来 —— 这是新手最容易踩的坑之一。
 * （UNavigationMenu 的 items 用的是 Iconify 名称 `i-lucide-*`，
 *   由 @nuxt/icon 解析，不需要 import。）
 */
import { Sparkles } from 'lucide-vue-next'

const auth = useAuth()

/** 主导航项。新增的「热门项目」指向 /trending */
const navItems = computed(() => [
  { label: '帖子流', to: '/', icon: 'i-lucide-flame' },
  { label: '热门项目', to: '/trending', icon: 'i-lucide-trending-up' },
])

/**
 * 用户下拉菜单。
 *
 * 用 `onSelect` 而不是 `@click`：这是 Nuxt UI 菜单项的标准回调名，
 * 同时兼容键盘操作（上下键 + 回车）与鼠标点击。
 */
const userMenuItems = computed(() => [
  {
    label: auth.user.value?.username ?? '',
    type: 'label' as const,
  },
  {
    label: '写一篇文章',
    icon: 'i-lucide-pen-line',
    to: '/posts/new',
  },
  {
    label: '退出登录',
    icon: 'i-lucide-log-out',
    onSelect: handleLogout,
  },
])

async function handleLogout(): Promise<void> {
  await auth.logout()
  // 登出后回到首页：留在需要登录的页面上会显得很怪
  await navigateTo('/')
}
</script>

<template>
  <UHeader
    :toggle="false"
    class="fixed inset-x-0 top-0 z-50 h-16 border-b border-default bg-default/75 backdrop-blur-xl"
  >
    <!-- 品牌区 -->
    <template #left>
      <NuxtLink to="/" class="group flex items-center gap-2.5">
        <span
          class="grid h-9 w-9 place-items-center rounded-xl bg-primary text-white shadow-sm transition-transform duration-300 group-hover:scale-105"
        >
          <Sparkles :size="18" />
        </span>
        <span class="flex flex-col leading-none">
          <span class="text-subtitle font-semibold tracking-tight text-highlighted">
            studyplan
          </span>
          <span class="mt-0.5 text-eyebrow text-muted">学习 · 技术分享</span>
        </span>
      </NuxtLink>
    </template>

    <!-- 主导航：移动端隐藏（与既有行为一致，导航项很少，不需要汉堡菜单） -->
    <UNavigationMenu :items="navItems" class="hidden md:flex" />

    <!-- 操作区 -->
    <template #right>
      <UColorModeButton color="neutral" variant="ghost" />

      <UButton to="/posts/new" icon="i-lucide-pen-line" class="font-medium">
        <span class="hidden sm:inline">写文章</span>
      </UButton>

      <!-- 已登录：头像 + 下拉菜单 -->
      <UDropdownMenu v-if="auth.isLoggedIn.value" :items="userMenuItems">
        <UButton
          color="neutral"
          variant="ghost"
          class="flex items-center gap-1.5 px-1.5"
          :aria-label="`用户菜单：${auth.user.value?.username}`"
        >
          <span
            class="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-caption font-semibold text-primary"
          >
            {{ avatarInitial(auth.user.value?.username ?? '') }}
          </span>
          <span class="hidden text-body-sm font-medium sm:inline">
            {{ auth.user.value?.username }}
          </span>
        </UButton>
      </UDropdownMenu>

      <!-- 未登录：登录入口 -->
      <UButton
        v-else
        to="/login"
        color="neutral"
        variant="outline"
        icon="i-lucide-log-in"
      >
        <span class="hidden sm:inline">登录</span>
      </UButton>
    </template>
  </UHeader>
</template>
