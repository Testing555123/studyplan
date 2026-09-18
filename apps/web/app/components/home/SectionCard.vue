<script setup lang="ts">
/**
 * 分区卡片外壳，对应 v0 的 SectionCard。
 * 顶部三段式：图标盒（primary/10 底 + primary 字）+ 标题 + 右上「查看全部 →」。
 * 下方为各区内容（slot）。AboutEbook / GithubCta 是独立卡片，不使用本组件。
 */
defineProps<{
  /** i-lucide-* 图标名 */
  icon: string
  title: string
  href: string
  /** 可选：自定义图标盒样式（如 AI 强调色用 bg-accent/10 text-accent） */
  iconClass?: string
}>()
</script>

<template>
  <div class="flex h-full flex-col rounded-2xl border border-default bg-default p-5 shadow-sm transition-shadow duration-300 hover:shadow-md md:p-6">
    <div class="mb-4 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2.5">
        <div
          class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"
          :class="iconClass"
        >
          <UIcon :name="icon" :size="18" />
        </div>
        <h2 class="text-base font-semibold text-highlighted">{{ title }}</h2>
      </div>
      <NuxtLink
        :to="href"
        class="flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        查看全部
        <UIcon name="i-lucide-arrow-right" :size="14" />
      </NuxtLink>
    </div>
    <div class="flex flex-1 flex-col gap-3">
      <slot />
    </div>
  </div>
</template>
