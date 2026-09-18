<script setup lang="ts">
/**
 * 个人资料卡 + README 盒（对应 v0 的 ProfileHero）。
 * 当前用静态占位资料；wire 阶段接入真实用户/项目信息。
 */
const profile = {
  name: '李东东',
  handle: '@dongdong',
  title: '全栈工程师 · HKUST',
  bio: '记录从课堂到上线的全过程：数据结构、系统设计、Nuxt 与 NestJS 实战。',
  github: 'https://github.com/dongdong',
  avatar: '',
  readme: [
    '这个项目用 Nuxt 4 + NestJS 11 + MongoDB 搭建，是一个边做边学的全栈教学案例。',
    '前端所有界面都先在 v0 出原型，再用 Nuxt UI 复刻，保证设计与代码一致。',
    '欢迎在帖子流里分享你的学习笔记，或在 GitHub 上一起贡献。',
  ],
}

function initials(name: string): string {
  return name.slice(0, 2)
}
</script>

<template>
  <div class="rounded-2xl border border-default bg-default p-6 shadow-sm md:p-8">
    <div class="flex flex-col gap-6 sm:flex-row sm:items-start">
      <UAvatar
        :src="profile.avatar || undefined"
        :alt="profile.name"
        class="h-20 w-20 shrink-0 ring-2 ring-primary/15 sm:h-24 sm:w-24"
      >
        <template #fallback>
          <span class="text-xl font-semibold">{{ initials(profile.name) }}</span>
        </template>
      </UAvatar>

      <div class="flex-1 space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-xl font-bold text-highlighted md:text-2xl">{{ profile.name }}</h1>
          <span class="text-sm text-muted">{{ profile.handle }}</span>
        </div>
        <p class="text-sm font-medium text-primary">{{ profile.title }}</p>
        <p class="max-w-2xl text-sm leading-relaxed text-muted">{{ profile.bio }}</p>

        <div class="flex flex-wrap gap-2 pt-1">
          <UButton
            :to="profile.github"
            target="_blank"
            rel="noopener"
            variant="outline"
            size="sm"
            icon="i-lucide-github"
          >
            GitHub 主页
          </UButton>
        </div>
      </div>
    </div>

    <div class="mt-6 rounded-xl border border-default bg-muted/50 p-4 md:p-5">
      <div class="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        <UIcon name="i-lucide-file-text" :size="14" />
        README.md
      </div>
      <div class="space-y-2">
        <p v-for="(line, i) in profile.readme" :key="i" class="text-sm leading-relaxed text-toned">
          {{ line }}
        </p>
      </div>
    </div>
  </div>
</template>
