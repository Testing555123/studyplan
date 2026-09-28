<script setup lang="ts">
/**
 * 个人资料卡 + README 盒（对应 v0 的 ProfileHero）。
 * 当前用静态占位资料；wire 阶段接入真实用户/项目信息。
 *
 * ── 这一版的视觉改动 ──
 *
 *   1. 外卡换成玻璃质感（.glass-card）：半透明底 + 背景模糊 + 顶部高光。
 *      它下面就是光晕层，玻璃的意义在于**让背景的光透上来**，
 *      如果这里用不透明底色，光晕就只出现在卡片四周，中间是一块死板的色块。
 *   2. 头像外圈加一圈 brand→ai 的渐变光环，缓慢呼吸。
 *   3. 三组内容（头像 / 文字 / README）以 90ms 间隔依次上浮淡入。
 *
 * 入场用的是 CSS 动画而不是"初始隐藏 + JS 点亮"：
 * 首屏元素本来就该立刻可见，动画只是让它出现得更柔和。
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
  <div class="glass-card relative rounded-panel p-6 md:p-8">
    <div class="flex flex-col gap-6 sm:flex-row sm:items-start">
      <!-- 头像 + 呼吸光环 -->
      <div class="relative shrink-0 animate-fade-up">
        <span
          class="ring-breathe absolute -inset-2 rounded-pill bg-gradient-to-br from-brand-400 to-ai-500 blur-md"
          aria-hidden="true"
        />
        <UAvatar
          :src="profile.avatar || undefined"
          :alt="profile.name"
          class="relative h-20 w-20 shrink-0 ring-2 ring-primary/15 sm:h-24 sm:w-24"
        >
          <template #fallback>
            <span class="text-xl font-semibold">{{ initials(profile.name) }}</span>
          </template>
        </UAvatar>
      </div>

      <div class="flex-1 animate-fade-up space-y-3" style="animation-delay: 90ms">
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

    <!-- README 盒：内嵌一层磨砂，与外卡形成"玻璃里还有一层玻璃"的层次 -->
    <!--
      README 盒改用 UCard：边框 / 底色 / 内距交给组件库的 variant 与 ui，
      这里只保留两件组件不管的事 —— 内凹底色与入场动画。

      ⚠️ root 显式指定 bg-muted（L2 凹槽灰）而不是沿用 soft 变体的
         bg-elevated/50：这一层**嵌在白色资料卡内部**，
         若也做成白，就和外卡糊成一团，"内嵌一层"的层次没了。
         凹槽灰正好表达「README 是资料卡里的一块引述区」。
         同时移除 backdrop-blur-sm —— 底色已不透明，模糊不但无效还白付渲染成本。
    -->
    <UCard
      variant="soft"
      class="mt-6 animate-fade-up"
      :ui="{ root: 'bg-muted', body: 'p-4 md:p-5' }"
      style="animation-delay: 180ms"
    >
      <div class="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        <UIcon name="i-lucide-file-text" class="size-[var(--icon-sm)]" />
        README.md
      </div>
      <div class="space-y-2">
        <p v-for="(line, i) in profile.readme" :key="i" class="text-sm leading-relaxed text-toned">
          {{ line }}
        </p>
      </div>
    </UCard>
  </div>
</template>
