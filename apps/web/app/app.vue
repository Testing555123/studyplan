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
 */
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
  </UApp>
</template>
