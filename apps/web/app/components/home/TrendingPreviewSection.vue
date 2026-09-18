<script setup lang="ts">
/**
 * GitHub 热门预览（对应 v0 的 TrendingPreviewSection）。
 * 静态占位；wire 阶段接 /github/trending。
 */
const repos = [
  { owner: 'dongdong', name: 'studyplan', stars: 1240, description: '边做边学的全栈教学项目', language: 'TypeScript', languageColor: '#3178c6' },
  { owner: 'vuejs', name: 'core', stars: 47200, description: 'Vue.js 渐进式 JavaScript 框架', language: 'TypeScript', languageColor: '#3178c6' },
  { owner: 'nuxt', name: 'nuxt', stars: 56500, description: '直观的 Vue 全栈框架', language: 'TypeScript', languageColor: '#3178c6' },
  { owner: 'nest', name: 'nest', stars: 28100, description: '渐进式 Node.js 框架', language: 'TypeScript', languageColor: '#3178c6' },
]
</script>

<template>
  <HomeSectionCard icon="i-lucide-star" title="GitHub 热门" href="/trending">
    <NuxtLink
      v-for="repo in repos"
      :key="`${repo.owner}/${repo.name}`"
      :to="`/trending/${repo.owner}/${repo.name}`"
      class="group block rounded-xl border border-transparent p-2.5 -m-0.5 transition-colors duration-200 hover:border-default hover:bg-muted/60"
    >
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-medium text-highlighted group-hover:text-primary">
          {{ repo.owner }}/{{ repo.name }}
        </h3>
        <span class="flex shrink-0 items-center gap-1 text-xs text-muted">
          <UIcon name="i-lucide-star" :size="12" />
          {{ (repo.stars / 1000).toFixed(1) }}k
        </span>
      </div>
      <p class="mt-1 line-clamp-1 text-xs text-muted">{{ repo.description }}</p>
      <div class="mt-1.5 flex items-center gap-1.5">
        <span class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: repo.languageColor }" />
        <span class="text-[11px] text-muted">{{ repo.language }}</span>
      </div>
    </NuxtLink>
  </HomeSectionCard>
</template>
