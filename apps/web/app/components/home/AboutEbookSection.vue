<script setup lang="ts">
/**
 * 关于 / 电子书（对应 v0 的 AboutEbookSection）。
 * 独立卡片：图标用 AI 强调色 accent，配「阅读配套电子书」按钮（accent/violet）。
 *
 * 它是四个分区里唯一不用 SectionCard 外壳的一张（没有「查看全部」），
 * 所以直接套一层 AppTiltCard —— 否则滚动时会出现
 * "另外三张有动效、这一张纹丝不动"的割裂感。
 */
</script>

<template>
  <AppTiltCard class="h-full">
    <div
      class="relative flex h-full flex-col rounded-2xl border border-default bg-default/70 p-5 shadow-sm transition-shadow duration-300 group-hover:shadow-md md:p-6"
    >
      <div class="mb-4 flex items-center gap-2.5">
        <div class="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-ai/10 text-ai">
          <span
            class="absolute inset-0 bg-gradient-to-br from-ai-500 to-brand-400 opacity-0 transition-opacity duration-300 group-hover:opacity-30"
            aria-hidden="true"
          />
          <UIcon name="i-lucide-book-open" :size="18" class="relative" />
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
          class="w-fit transition duration-200 hover:scale-[1.03] hover:shadow-lg hover:shadow-ai-500/25 active:scale-[0.97]"
        >
          阅读配套电子书
        </UButton>
      </div>
    </div>
  </AppTiltCard>
</template>
