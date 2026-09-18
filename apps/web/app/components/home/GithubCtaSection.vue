<script setup lang="ts">
/**
 * GitHub Star 号召区（对应 v0 的 GithubCtaSection）。
 */
const githubUrl = 'https://github.com/dongdong'
</script>

<template>
  <div class="flex flex-col items-center gap-4 rounded-2xl border border-default bg-default p-8 text-center shadow-sm md:flex-row md:justify-between md:text-left">
    <div class="flex items-center gap-4">
      <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-inverted text-inverted">
        <UIcon name="i-lucide-github" :size="24" />
      </div>
      <div>
        <h2 class="text-base font-semibold text-highlighted">觉得这个项目有帮助？</h2>
        <p class="text-sm text-muted">在 GitHub 上点一颗 Star，支持我持续更新学习笔记。</p>
      </div>
    </div>
    <UButton
      :to="githubUrl"
      target="_blank"
      rel="noopener"
      icon="i-lucide-star"
      class="shrink-0"
    >
      Star on GitHub
    </UButton>
  </div>
</template>
