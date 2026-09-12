<script setup lang="ts">
/**
 * 全局页脚。
 *
 * 刻意做得很轻：一行版权 + 一个电子书入口。
 * 页脚的作用是"给页面一个收口"，不是再堆一堆链接分散注意力。
 *
 * ── Nuxt UI 化之后 ──
 * 外壳换成 `UFooter`（自带边框、内边距与 `UContainer` 居中），
 * 文本改用语义类 `text-muted` / `text-dimmed`，暗色模式自动适配。
 * 过去这里要写 `text-slate-500 dark:text-slate-400` 两套，现在一套就够。
 */
import { BookOpen } from 'lucide-vue-next'

const year = new Date().getFullYear()
</script>

<template>
  <UFooter class="mt-16">
    <template #left>
      <p class="text-xs text-muted">© {{ year }} studyplan · 一个边做边学的全栈教学项目</p>
    </template>

    <template #right>
      <div class="flex items-center gap-4 text-xs">
        <ULink
          to="/ebook/"
          target="_blank"
          class="inline-flex items-center gap-1.5 text-muted transition-colors hover:text-primary"
        >
          <BookOpen :size="14" />
          <span>配套电子书</span>
        </ULink>
        <span class="text-dimmed">|</span>
        <span class="text-muted">Nuxt 4 · NestJS 11 · MongoDB</span>
      </div>
    </template>
  </UFooter>
</template>
