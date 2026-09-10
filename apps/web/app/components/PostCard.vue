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
  <article class="post-card group relative p-5 sm:p-6">
    <!-- 整卡可点：用绝对定位的链接覆盖整张卡片，同时保持标题可被单独选中复制 -->
    <NuxtLink
      :to="`/posts/${post.id}`"
      class="absolute inset-0 z-0 rounded-2xl"
      :aria-label="`阅读：${post.title}`"
    />

    <div class="relative z-10 pointer-events-none">
      <!-- 标题 -->
      <h3
        class="text-[17px] leading-7 font-semibold tracking-tight text-slate-900 transition-colors group-hover:text-brand-600 dark:text-white dark:group-hover:text-brand-400"
      >
        {{ post.title }}
      </h3>

      <!-- AI 摘要：没有摘要时不占位、不留空洞 -->
      <p
        v-if="post.summary"
        class="mt-2 line-clamp-2 text-[13.5px] leading-6 text-slate-500 dark:text-slate-400"
      >
        {{ post.summary }}
      </p>
      <p v-else class="mt-2 text-[13px] leading-6 text-slate-400 italic dark:text-slate-500">
        这篇还没有摘要
      </p>

      <!-- 标签 -->
      <div class="mt-3.5 flex flex-wrap items-center gap-2">
        <NuxtLink
          v-for="tag in post.tags"
          :key="tag"
          :to="`/?tag=${encodeURIComponent(tag)}`"
          class="tag-pill tag-pill-idle pointer-events-auto"
        >
          {{ tag }}
        </NuxtLink>
      </div>

      <!-- 底部元信息 -->
      <div class="mt-4 flex items-center justify-between gap-4">
        <div class="flex items-center gap-2.5">
          <span
            class="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br text-[12px] font-semibold text-white"
            :class="avatarGradient(post.author.username)"
          >
            {{ avatarInitial(post.author.username) }}
          </span>
          <span class="text-[13px] text-slate-600 dark:text-slate-300">
            {{ post.author.username }}
          </span>
          <span class="text-slate-300 dark:text-slate-600">·</span>
          <time
            class="text-[12.5px] text-slate-400 dark:text-slate-500"
            :datetime="post.createdAt"
          >
            {{ formatRelativeTime(post.createdAt) }}
          </time>
        </div>

        <div class="flex items-center gap-4 text-[12.5px] text-slate-400 dark:text-slate-500">
          <button
            type="button"
            class="pointer-events-auto inline-flex cursor-pointer items-center gap-1.5 transition-colors hover:text-rose-500"
            :class="liked ? 'text-rose-500' : ''"
            :aria-pressed="liked"
            @click.stop="emit('toggle-like', post.id)"
          >
            <Heart :size="14" :fill="liked ? 'currentColor' : 'none'" />
            <span>{{ post.likeCount }}</span>
          </button>

          <span class="inline-flex items-center gap-1.5">
            <MessageSquare :size="14" />
            <span>{{ post.commentCount }}</span>
          </span>
        </div>
      </div>
    </div>

    <!-- 悬停时右侧滑出的小箭头：给"可以点进去"一个视觉提示 -->
    <span
      class="pointer-events-none absolute top-1/2 right-4 z-10 -translate-y-1/2 text-brand-400 opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100"
    >
      <ChevronRight :size="18" />
    </span>
  </article>
</template>
