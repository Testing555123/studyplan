<script setup lang="ts">
/**
 * 全局吸顶导航栏。
 *
 * 设计要点：
 *   - fixed + 毛玻璃（glass-bar，定义在 main.css）：滚动时内容从下方穿过，
 *     半透明背景让"层级关系"一眼可见；
 *   - 左侧 Logo、中间主导航、右侧操作区，用 flex + justify-between 三栏布局；
 *   - 移动端隐藏中间导航（md:flex），把空间让给操作区。
 *
 * 阶段 5 的变化：右侧操作区现在**响应登录态**——
 * 未登录显示"登录"，已登录显示头像 + 下拉菜单。
 *
 * 关于图标：lucide-vue-next 的图标是普通 Vue 组件，
 * **不在 Nuxt 的自动导入范围内**，必须逐个显式 import。
 * 漏掉 import 不会报错，只会静默渲染不出来 —— 这是新手最容易踩的坑之一。
 */
import { ChevronDown, Flame, LogIn, LogOut, PenLine, Sparkles, User } from 'lucide-vue-next'

const auth = useAuth()

/** 下拉菜单是否展开 */
const menuOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)

/**
 * 点击页面其它地方时关闭菜单。
 *
 * 为什么监听 document 而不是给页面加一个遮罩层？
 *   遮罩层会改变布局与点击行为（比如挡住卡片 hover 效果），
 *   而"点别处关闭"是一个纯粹的交互约定，用事件监听更轻。
 *
 * 注意判断 `contains`：点击菜单**内部**时不能关闭，
 * 否则用户刚点开、还没来得及点"登出"就被关掉了。
 */
function handleDocumentClick(event: MouseEvent): void {
  if (!menuOpen.value) return
  const target = event.target
  if (menuRef.value && target instanceof Node && !menuRef.value.contains(target)) {
    menuOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', handleDocumentClick))
onBeforeUnmount(() => document.removeEventListener('click', handleDocumentClick))

async function handleLogout(): Promise<void> {
  menuOpen.value = false
  await auth.logout()
  // 登出后回到首页：留在需要登录的页面上会显得很怪
  await navigateTo('/')
}
</script>

<template>
  <header class="glass-bar fixed inset-x-0 top-0 z-50 h-16">
    <div class="mx-auto flex h-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
      <!-- 品牌区 -->
      <NuxtLink to="/" class="group flex items-center gap-2.5">
        <span
          class="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/25 transition-transform duration-300 group-hover:scale-105"
        >
          <Sparkles :size="18" />
        </span>
        <span class="flex flex-col leading-none">
          <span class="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
            studyplan
          </span>
          <span class="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">学习 · 技术分享</span>
        </span>
      </NuxtLink>

      <!-- 主导航 -->
      <nav class="hidden items-center gap-1 md:flex">
        <NuxtLink to="/" class="nav-link">
          <Flame :size="15" />
          <span>帖子流</span>
        </NuxtLink>
      </nav>

      <!-- 操作区 -->
      <div class="flex items-center gap-2">
        <UColorModeButton color="neutral" variant="ghost" />

        <NuxtLink
          to="/posts/new"
          class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-500 px-3.5 text-sm font-medium text-white shadow-lg shadow-brand-500/20 transition-all duration-200 hover:bg-brand-600 hover:shadow-brand-500/30 active:scale-[0.97]"
        >
          <PenLine :size="15" />
          <span class="hidden sm:inline">写文章</span>
        </NuxtLink>

        <!-- 已登录：头像 + 下拉菜单 -->
        <div v-if="auth.isLoggedIn.value" ref="menuRef" class="relative">
          <button
            type="button"
            class="flex cursor-pointer items-center gap-1.5 rounded-xl py-1 pr-2 pl-1 transition-colors hover:bg-slate-100 dark:hover:bg-white/5"
            :aria-expanded="menuOpen"
            aria-haspopup="menu"
            @click="menuOpen = !menuOpen"
          >
            <span
              class="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br text-[12px] font-semibold text-white"
              :class="avatarGradient(auth.user.value?.username ?? '')"
            >
              {{ avatarInitial(auth.user.value?.username ?? '') }}
            </span>
            <span class="hidden text-[13px] font-medium text-slate-700 sm:inline dark:text-slate-200">
              {{ auth.user.value?.username }}
            </span>
            <ChevronDown
              :size="14"
              class="text-slate-400 transition-transform duration-200"
              :class="menuOpen ? 'rotate-180' : ''"
            />
          </button>

          <Transition
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="opacity-0 -translate-y-1"
            leave-active-class="transition duration-100 ease-in"
            leave-to-class="opacity-0 -translate-y-1"
          >
            <div
              v-if="menuOpen"
              class="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl shadow-slate-900/5 dark:border-white/10 dark:bg-[#16161d]"
              role="menu"
            >
              <div class="border-b border-slate-100 px-3.5 py-2.5 dark:border-white/5">
                <p class="truncate text-[13px] font-medium text-slate-900 dark:text-white">
                  {{ auth.user.value?.username }}
                </p>
                <p class="mt-0.5 truncate text-[11.5px] text-slate-400 dark:text-slate-500">
                  {{ auth.user.value?.email }}
                </p>
              </div>

              <NuxtLink
                to="/posts/new"
                class="flex items-center gap-2 px-3.5 py-2 text-[13px] text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
                @click="menuOpen = false"
              >
                <User :size="14" />
                写一篇文章
              </NuxtLink>

              <button
                type="button"
                class="flex w-full cursor-pointer items-center gap-2 px-3.5 py-2 text-[13px] text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                @click="handleLogout"
              >
                <LogOut :size="14" />
                退出登录
              </button>
            </div>
          </Transition>
        </div>

        <!-- 未登录：登录入口 -->
        <NuxtLink
          v-else
          to="/login"
          class="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 text-sm font-medium text-slate-600 transition-colors hover:border-brand-300 hover:text-brand-600 dark:border-white/10 dark:text-slate-300 dark:hover:border-brand-700 dark:hover:text-brand-400"
        >
          <LogIn :size="15" />
          <span class="hidden sm:inline">登录</span>
        </NuxtLink>
      </div>
    </div>
  </header>
</template>
