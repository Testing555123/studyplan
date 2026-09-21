<script setup lang="ts">
/**
 * GitHub Star 号召区（对应 v0 的 GithubCtaSection）。
 *
 * 外框用 .gradient-frame：1px 渐变底 + 内层不透明背景，只露出边缘一圈，
 * 渐变再沿边缓慢流动 —— 比静态边框更能把视线收进这张卡。
 *
 * 卡片本体也接了进入视口浮现：它在首页最下方，默认不在首屏内。
 */
const githubUrl = 'https://github.com/dongdong'

const { target, state, revealClass } = useReveal()
</script>

<template>
  <div ref="target" :class="revealClass(state)">
    <div class="gradient-frame">
      <div
        class="flex flex-col items-center gap-4 rounded-2xl bg-default p-8 text-center md:flex-row md:justify-between md:text-left"
      >
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
          class="shrink-0 transition duration-200 hover:scale-[1.03] hover:shadow-lg hover:shadow-brand-500/25 active:scale-[0.97]"
        >
          Star on GitHub
        </UButton>
      </div>
    </div>
  </div>
</template>
