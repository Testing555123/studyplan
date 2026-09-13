<script setup lang="ts">
/**
 * 帖子卡片。
 *
 * 它是列表页的视觉主体，也是"组件该切到什么粒度"的第一个例子：
 *   - 它只负责**展示**一篇帖子，不负责取数据；
 *   - 数据通过 props 进来，交互通过 emit 出去；
 *   - 因此它能同时被首页列表、搜索结果页、作者主页复用。
 *
 * 如果这个组件内部自己 `usePostStore().fetchList()`，
 * 它就只能用在首页了 —— 这是新手最常见的组件设计错误。
 *
 * ── Nuxt UI 化之后的变化 ──
 * 卡片外壳改用 `UCard`，标签用 `UBadge`，点赞用 `UButton`，
 * 文字颜色改用语义类（`text-highlighted` / `text-muted` …）而不是
 * 手写 `text-slate-900 dark:text-white`。
 *
 * 语义类的好处在暗色模式下最明显：过去每个颜色都要写两遍
 * （亮色一遍 + `dark:` 一遍），现在一遍就够，而且全站口径统一。
 * 剩下没被替换掉的是**布局类**（间距、flex、绝对定位）——
 * 那是 Nuxt UI 不提供的部分，按"务实保留"的约定照常使用。
 */
import { ChevronRight, Heart, MessageSquare } from 'lucide-vue-next'
import type { Post } from '@studyplan/shared'

const props = defineProps<{
  post: Post
}>()

const emit = defineEmits<{
  (event: 'toggle-like', postId: string): void
}>()

/** 点赞态由 store 统一管理，这里只读不写 */
const postStore = usePostStore()
const liked = computed(() => postStore.isLiked(props.post.id))
</script>

<template>
  <UCard
    class="group relative transition-all duration-300 hover:border-primary hover:shadow-sm"
    :ui="{ body: 'p-5 sm:p-6' }"
  >
    <!-- 标题：唯一可点链接，用 ::after 拉伸覆盖整卡；避免整卡 <a> 内再嵌套标签 <a> 的非法结构 -->
    <h3 class="text-title leading-7 font-semibold tracking-tight">
      <NuxtLink
        :to="`/posts/${post.id}`"
        class="text-highlighted transition-colors after:absolute after:inset-0 after:rounded-2xl group-hover:text-primary"
        :aria-label="`阅读：${post.title}`"
      >
        {{ post.title }}
      </NuxtLink>
    </h3>

    <!-- AI 摘要：没有摘要时不占位、不留空洞 -->
    <p v-if="post.summary" class="mt-2 line-clamp-2 text-body leading-6 text-muted">
      {{ post.summary }}
    </p>
    <p v-else class="mt-2 text-body-sm leading-6 italic text-muted">
      这篇还没有摘要
    </p>

    <!-- 标签：relative z-10 抬到拉伸链接之上，保证可独立点击 -->
    <div class="relative z-10 mt-3.5 flex flex-wrap items-center gap-2">
      <NuxtLink
        v-for="tag in post.tags"
        :key="tag"
        :to="`/?tag=${encodeURIComponent(tag)}`"
      >
        <UBadge variant="subtle" color="neutral" size="xs">
          {{ tag }}
        </UBadge>
      </NuxtLink>
    </div>

    <!-- 底部元信息 -->
    <div class="relative z-10 mt-4 flex items-center justify-between gap-4">
      <div class="flex items-center gap-2.5">
        <span
          class="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-caption font-semibold text-primary"
        >
          {{ avatarInitial(post.author.username) }}
        </span>
        <span class="text-body-sm text-toned">
          {{ post.author.username }}
        </span>
        <span class="text-dimmed">·</span>
        <time class="text-meta text-muted" :datetime="post.createdAt">
          {{ formatRelativeTime(post.createdAt) }}
        </time>
      </div>

      <div class="flex items-center gap-4 text-meta text-muted">
        <UButton
          variant="ghost"
          color="neutral"
          size="xs"
          :class="liked ? 'text-error' : ''"
          :aria-pressed="liked"
          @click.stop="emit('toggle-like', post.id)"
        >
          <template #leading>
            <Heart :size="14" :fill="liked ? 'currentColor' : 'none'" />
          </template>
          {{ post.likeCount }}
        </UButton>

        <span class="inline-flex items-center gap-1.5">
          <MessageSquare :size="14" />
          <span>{{ post.commentCount }}</span>
        </span>
      </div>
    </div>

    <!-- 悬停时右侧滑出的小箭头：给"可以点进去"一个视觉提示 -->
    <span
      class="pointer-events-none absolute top-1/2 right-4 z-10 -translate-y-1/2 text-primary opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100"
    >
      <ChevronRight :size="18" />
    </span>
  </UCard>
</template>
