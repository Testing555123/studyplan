<script setup lang="ts">
/**
 * 关于 / 电子书（对应 v0 的 AboutEbookSection）。
 * 独立卡片：图标用 AI 强调色 accent，配「阅读配套电子书」按钮（accent/violet）。
 */
</script>

<template>
  <div class="flex h-full flex-col rounded-2xl border border-default bg-default p-5 shadow-sm md:p-6">
    <div class="mb-4 flex items-center gap-2.5">
      <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-ai/10 text-ai">
        <UIcon name="i-lucide-book-open" :size="18" />
      </div>
      <h2 class="text-base font-semibold text-highlighted">关于 / 电子书</h2>
    </div>

    <div class="flex flex-1 flex-col justify-between gap-4">
      <p class="text-sm leading-relaxed text-muted">
        我把过去一年的学习笔记整理成了一本免费电子书，涵盖数据结构与算法、系统设计基础，以及全栈项目实战案例。适合正在系统学习计算机知识的同学。
      </p>
      <UButton
        to="/ebook/"
        color="ai"
        variant="solid"
        icon="i-lucide-arrow-right"
        class="w-fit"
      >
        阅读配套电子书
      </UButton>
    </div>
  </div>
</template>
