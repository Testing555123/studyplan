<script setup lang="ts">
/**
 * 应用根组件。
 *
 * 它是所有页面的最外层容器，只负责三件事：
 *   1. 把页面切成「页头 / 内容 / 页脚」三段，并用 flex 让内容区自动撑满剩余高度
 *      （这样页脚永远贴在底部，短页面也不会悬在半空）；
 *   2. 用 <UApp> 包裹 —— Nuxt UI 的提示条、下拉菜单等"浮层"需要它提供的上下文；
 *   3. <NuxtPage> 是文件路由的出口：app/pages/ 下的每个文件都会渲染到这里。
 *
 * 注意 main 上的 pt-16：页头是 fixed 定位，不占文档流，
 * 不给内容留出 4rem 的上边距，首屏内容就会被页头盖住。
 */
</script>

<template>
  <UApp>
    <div class="flex min-h-screen flex-col bg-slate-50 transition-colors dark:bg-[#0d0d12]">
      <AppHeader />

      <main class="flex-1 pt-16">
        <NuxtPage />
      </main>

      <AppFooter />
    </div>
  </UApp>
</template>
