<script setup lang="ts">
/**
 * 全局页脚，刻意做得轻：一行版权 + 一个电子书入口，
 * 作用是给页面收个尾，而不是再堆一堆链接分散注意力。
 *
 * 外壳用 `UFooter`（自带边框、内边距与居中容器），
 * 文本用语义类 `text-muted` / `text-dimmed`，明暗模式自动适配。
 */
import { BookOpen } from 'lucide-vue-next'

const year = new Date().getFullYear()
</script>

<template>
  <UFooter class="mt-16">
    <template #left>
      <p class="text-caption text-muted">© {{ year }} studyplan · 一个边做边学的全栈教学项目</p>
    </template>

    <template #right>
      <div class="flex items-center gap-4 text-caption">
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
