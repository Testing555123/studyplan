<script setup lang="ts">
/**
 * GitHub 项目卡片。
 *
 * 与 PostCard 一样只负责展示，交互通过 emit 交给页面处理：
 * 点「问 AI」时把整个 repo 抛出去，由页面决定怎么唤起助手。
 * 这样这个卡片将来也能用在别处（比如收藏列表），不必被助手绑死。
 *
 * ── 两处 null 兜底是刻意的 ──
 * GitHub 的 `description` 与 `language` 都**可能为 null**：
 * 很多仓库不写简介，纯文档仓库没有语言。
 * 直接渲染会出现"空白一片"或"undefined"，
 * 所以两者都要有明确的兜底文案，而不是假装它们一定有值。
 */
import { ExternalLink, GitFork, Star } from 'lucide-vue-next'
import { languageColor } from '@studyplan/shared'
import type { GithubRepo } from '@studyplan/shared'

const props = defineProps<{
  repo: GithubRepo
}>()

const emit = defineEmits<{
  (event: 'ask', repo: GithubRepo): void
}>()

/** 语言色点：没有语言时用中性灰，而不是不显示 */
const dotColor = computed(() => languageColor(props.repo.language))

/** 话题标签最多展示 3 个，避免卡片被撑高、视觉上喧宾夺主 */
const visibleTopics = computed(() => props.repo.topics.slice(0, 3))
</script>

<template>
  <!--
    ⚠️ 这里**不要**写 `h-full`。
    踩过的坑：加上它之后，卡片高度被强行绑定到网格行高，
    而 flex 子项（UCard 的 body）的 `min-height` 默认是 `auto`——
    它宁可溢出也不收缩，于是"话题标签"会压到 footer 的「问 AI」按钮上。
    去掉 `h-full` 即可：网格项本来就是 `align-items: stretch`，
    同一行里的卡片照样等高，但内容多的那张会把行高撑开而不是溢出。
  -->
  <UCard
    class="group flex flex-col transition-all duration-300 hover:-translate-y-1 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-500/5 dark:hover:border-primary-800"
    :ui="{ body: 'flex-1 p-5', footer: 'pt-0 pb-4 px-5' }"
  >
    <!-- 拥有者 -->
    <div class="flex items-center gap-2">
      <UAvatar :src="repo.ownerAvatarUrl" :alt="repo.ownerLogin" size="2xs" />
      <span class="truncate text-xs text-muted">{{ repo.ownerLogin }}</span>
    </div>

    <!-- 项目名（外链直达 GitHub） -->
    <h3 class="mt-2">
      <ULink
        :to="repo.htmlUrl"
        target="_blank"
        rel="noopener"
        class="inline-flex items-center gap-1.5 text-[15px] font-semibold tracking-tight text-highlighted transition-colors hover:text-primary"
      >
        <span class="truncate">{{ repo.name }}</span>
        <ExternalLink :size="13" class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
      </ULink>
    </h3>

    <!-- 简介：这就是需求里的"简洁介绍"，直接取 GitHub 官方 description -->
    <p v-if="repo.description" class="mt-2 line-clamp-2 text-[13px] leading-6 text-muted">
      {{ repo.description }}
    </p>
    <p v-else class="mt-2 text-[13px] leading-6 italic text-dimmed">
      这个项目还没有填写简介
    </p>

    <!--
      话题标签。
      ⚠️ 这里**不能**给 UBadge 加 `truncate`：它内部是 inline-flex + nowrap，
      加了 ellipsis 之后徽章既不收缩也不换行，长 topic 会直接冲出卡片边界
      （实测截图里就看到"ai-video"跑到了卡片外面）。
      正确做法是给徽章限宽、把截断交给内部的 span。
    -->
    <div v-if="visibleTopics.length > 0" class="mt-3 flex flex-wrap gap-1.5">
      <UBadge
        v-for="topic in visibleTopics"
        :key="topic"
        variant="soft"
        color="neutral"
        size="xs"
        class="max-w-full"
      >
        <span class="truncate">{{ topic }}</span>
      </UBadge>
    </div>

    <!-- 元信息行 -->
    <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-muted">
      <span class="inline-flex items-center gap-1.5">
        <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ backgroundColor: dotColor }" />
        <span>{{ repo.language ?? '未标注语言' }}</span>
      </span>

      <span class="inline-flex items-center gap-1 tabular-nums">
        <Star :size="13" />
        {{ repo.stargazersCount.toLocaleString() }}
      </span>

      <span class="inline-flex items-center gap-1 tabular-nums">
        <GitFork :size="13" />
        {{ repo.forksCount.toLocaleString() }}
      </span>

      <span class="text-dimmed">创建于 {{ formatRelativeTime(repo.createdAt) }}</span>
    </div>

    <template #footer>
      <UButton
        size="xs"
        variant="soft"
        color="primary"
        icon="i-lucide-sparkles"
        @click="emit('ask', repo)"
      >
        问 AI
      </UButton>
    </template>
  </UCard>
</template>
