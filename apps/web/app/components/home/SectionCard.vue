<script setup lang="ts">
/**
 * 分区卡片外壳，对应 v0 的 SectionCard。
 * 顶部三段式：图标盒（primary/10 底 + primary 字）+ 标题 + 右上「查看全部 →」。
 * 下方为各区内容（slot）。AboutEbook / GithubCta 是独立卡片，不使用本组件。
 *
 * ── 动效从哪来 ──
 *
 * 浮现与倾斜不再写在这里，而是交给外层 `<AppTiltCard>`：
 * 榜单页的 RepoCard、详情页的大卡都用同一个外壳，
 * "怎么浮现、倾斜几度、降级怎么做"因此只存在一份。
 *
 * 本组件只保留两件自己的事：卡片本体的排版，以及 hover 时的阴影与图标盒渐变。
 * 注意 `group-hover:` 依然可用 —— `.group` 在外壳的根元素上，是这里的祖先。
 */
defineProps<{
  /** i-lucide-* 图标名 */
  icon: string
  title: string
  href: string
  /** 可选：自定义图标盒样式（如 AI 强调色用 bg-accent/10 text-accent） */
  iconClass?: string
  /**
   * 在网格中的序号，决定错落浮现的延迟（--i × 45ms）。
   * 传给 AppTiltCard；不传则由外壳继承父容器的 --i。
   */
  index?: number
}>()
</script>

<template>
  <AppTiltCard class="h-full" :index="index">
    <div
      class="relative flex h-full flex-col rounded-2xl border border-default bg-default/70 p-5 shadow-sm transition-shadow duration-300 group-hover:shadow-md md:p-6"
    >
      <div class="mb-4 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2.5">
          <div
            class="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary"
            :class="iconClass"
          >
            <!--
              hover 时叠一层 brand→ai 渐变。
              渐变本身无法做 transition，所以改的是这层的透明度：
              用 opacity 过渡拿到"底色渐变变化"的观感，成本却和改颜色一样低。
            -->
            <span
              class="absolute inset-0 bg-gradient-to-br from-brand-400 to-ai-500 opacity-0 transition-opacity duration-300 group-hover:opacity-30"
              aria-hidden="true"
            />
            <UIcon :name="icon" :size="18" class="relative" />
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
  </AppTiltCard>
</template>
