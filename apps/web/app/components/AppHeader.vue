<script setup lang="ts">
/**
 * 全局吸顶导航栏，仿 v0 原型：
 * 左侧是侧栏折叠按钮（桌面）/ 菜单按钮（移动端抽屉），右侧是搜索、明暗切换、写文章、登录。
 * 主导航已迁到 AppSidebar，故顶栏不再重复 UNavigationMenu，避免两套导航冗余。
 *
 * 外壳用 UHeader（自带居中容器、明暗适配）；保留的 Tailwind 都是布局类
 * （fixed/sticky、flex、gap），交互元素全部走 Nuxt UI 组件与语义色。
 */
const auth = useAuth()

/**
 * 快捷键提示随平台变化。
 *
 * ⚠️ 原先固定显示「⌘K」，但 app.vue 只注册了 meta_k —— 非 macOS 用户
 *    既看到 ⌘K 提示、又按不出来（现已补 ctrl_k）。这里让提示跟着平台走。
 *
 * SSR 首屏统一按 ⌘K 渲染，水合后再校正，避免服务端与客户端输出不一致
 * 触发 hydration mismatch。
 */
const shortcutHint = ref('⌘K')
onMounted(() => {
  const isApple = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
  shortcutHint.value = isApple ? '⌘K' : 'Ctrl+K'
})

/**
 * 滚动后，页头底部渐显一条 brand→ai 的渐变分隔线（样式在 main.css）。
 * 它只在"内容已经滑到页头下方"时出现，给滚动一个可见的反馈。
 */
const scrolled = useScrolled()

/** 全局命令面板开关：与 app.vue 共享同一份 useState */
const commandOpen = useState<boolean>('command-palette-open', () => false)

const props = withDefaults(defineProps<{ sidebarOpen?: boolean }>(), { sidebarOpen: true })
const emit = defineEmits<{
  toggleSidebar: []
  toggleMobileNav: []
}>()

const sidebarOpenIcon = computed(() =>
  props.sidebarOpen ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left',
)

function avatarInitial(name: string): string {
  return name ? name.slice(0, 2).toUpperCase() : '?'
}

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
  await navigateTo('/')
}
</script>

<template>
  <UHeader
    :toggle="false"
    class="header-gradient-line sticky top-0 z-[var(--z-header)] h-[var(--layout-header-h)] border-b border-default bg-default/75 backdrop-blur-xl"
    :class="{ 'is-scrolled': scrolled }"
  >
    <!-- 左侧：侧栏控制 -->
    <template #left>
      <div class="flex items-center gap-1">
        <!-- 桌面：折叠 / 展开侧栏 -->
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          :icon="sidebarOpenIcon"
          class="hidden sm:inline-flex"
          :aria-label="sidebarOpen ? '隐藏侧栏' : '显示侧栏'"
          @click="emit('toggleSidebar')"
        />
        <!-- 移动端：打开抽屉 -->
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-menu"
          class="sm:hidden"
          aria-label="打开导航"
          @click="emit('toggleMobileNav')"
        />
        <!-- 移动端品牌（侧栏隐藏时显示） -->
        <NuxtLink to="/" class="group flex items-center gap-2.5 sm:hidden">
          <!--
            品牌方块：圆角与阴影改引令牌；图标统一走 i-lucide-* 字符串
            （此前 Sparkles 一会儿用组件导入、一会儿用 Iconify 名，两条路径并存）
          -->
          <span
            class="grid h-9 w-9 place-items-center rounded-card bg-primary text-[var(--color-on-primary)] [box-shadow:var(--elevation-panel)]"
          >
            <UIcon name="i-lucide-sparkles" class="size-[var(--icon-md)]" />
          </span>
          <span class="text-subtitle font-semibold text-highlighted">studyplan</span>
        </NuxtLink>
      </div>
    </template>

    <!-- 操作区 -->
    <template #right>
      <UTooltip>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-search"
          label="搜索"
          @click="commandOpen = true"
        />
        <template #content>
          <span>搜索</span>
          <UKbd>{{ shortcutHint }}</UKbd>
        </template>
      </UTooltip>

      <UTooltip text="切换明暗主题">
        <UColorModeButton color="neutral" variant="ghost" />
      </UTooltip>

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
            class="grid h-7 w-7 place-items-center rounded-pill bg-primary/10 text-caption font-semibold text-primary"
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
