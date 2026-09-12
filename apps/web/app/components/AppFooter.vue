<script setup lang="ts">
/**
 * 全局页脚。
 *
 * 刻意做得很轻：一行版权 + 一个电子书入口。
 * 页脚的作用是"给页面一个收口"，不是再堆一堆链接分散注意力。
 */
const year = new Date().getFullYear()
</script>

<template>
  <footer class="mt-16 border-t border-slate-200 dark:border-white/10">
    <div
      class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-xs text-slate-500 sm:flex-row sm:px-6 dark:text-slate-400"
    >
      <p>© {{ year }} studyplan · 一个边做边学的全栈教学项目</p>

      <div class="flex items-center gap-4">
        <a
          href="/ebook/"
          target="_blank"
          rel="noopener"
          class="inline-flex items-center gap-1.5 transition-colors hover:text-brand-600 dark:hover:text-brand-400"
        >
          <BookOpen :size="14" />
          <span>配套电子书</span>
        </a>
        <span class="text-slate-300 dark:text-slate-600">|</span>
        <span>Nuxt 4 · NestJS 11 · MongoDB</span>
      </div>
    </div>
  </footer>
</template>
