<script setup lang="ts">
/**
 * 单个 GitHub 项目的详情页。
 *
 * 数据来源是三级回退（榜单缓存 → 已落库快照 → 现取 GitHub），
 * 由后端在响应里用 `source` 如实交代走了哪一级 ——
 * 这个页面只负责把结果和"数据可能不是最新"如实呈现出来。
 *
 * 与列表页一致，用 `useAsyncData` 在服务端取好，
 * 所以直接打开一个分享链接就能看到内容，而不是先一屏骨架。
 */
import { ArrowLeft, ExternalLink, GitFork, Star } from 'lucide-vue-next'
import { languageColor, type RepoDetailResponse } from '@studyplan/shared'
import type { BreadcrumbItem } from '@nuxt/ui'

const route = useRoute()
const api = useApi()
const ai = useAiAssistant()
const { introFor, ensure } = useRepoIntros()

const owner = computed(() => String(route.params.owner ?? ''))
const repoName = computed(() => String(route.params.repo ?? ''))

/** 详情页面包屑：热门项目 → owner/repo，最后一项为当前页（不可点） */
const breadcrumbItems = computed<BreadcrumbItem[]>(() => [
  { label: 'GitHub 热门项目', icon: 'i-lucide-trending-up', to: '/trending' },
  { label: `${owner.value}/${repoName.value}` },
])

const { data, pending, error, refresh } = await useAsyncData(
  () => `repo-${owner.value}-${repoName.value}`,
  () =>
    api.get<RepoDetailResponse>(
      `/github/repos/${encodeURIComponent(owner.value)}/${encodeURIComponent(repoName.value)}`,
    ),
  { watch: [owner, repoName] },
)

const detail = computed(() => data.value ?? null)
const repo = computed(() => detail.value?.repo ?? null)

/** 有 AI 润色版就显示它，没有则退回 GitHub 官方简介 */
const displayIntro = computed(() => {
  if (!repo.value) return null
  return introFor(repo.value.id) ?? repo.value.description
})

const dotColor = computed(() => languageColor(repo.value?.language ?? null))

/**
 * 简介生成只在客户端发起。
 *
 * 它要真调一次模型，放在 SSR 里会让首屏白白等上几十秒 ——
 * 而这一屏的核心信息（项目数据）早就渲染完了，没理由为它 Hold 住。
 */
onMounted(() => {
  if (repo.value) void ensure([repo.value])
})
</script>

<template>
  <UContainer>
    <!-- 面包屑：可点路径导航，替代裸返回链接 -->
    <UBreadcrumb :items="breadcrumbItems" class="pt-10" />

    <USeparator class="my-6" />

    <!-- 加载骨架 -->
    <UCard v-if="pending && !repo" :ui="{ body: 'p-6' }">
      <USkeleton class="h-7 w-1/2" />
      <USkeleton class="mt-4 h-4 w-3/4" />
      <USkeleton class="mt-2 h-4 w-2/3" />
      <div class="mt-6 flex gap-4">
        <USkeleton class="h-4 w-20" />
        <USkeleton class="h-4 w-16" />
      </div>
    </UCard>

    <!-- 取不到：可能是仓库不存在、被删除，或已转成私有 -->
    <section v-else-if="error" class="pb-10">
      <UAlert
        color="error"
        variant="soft"
        icon="i-lucide-alert-circle"
        title="没能找到这个项目"
        :description="(error as Error).message"
      />
      <UButton
        class="mt-3"
        size="sm"
        color="error"
        variant="outline"
        icon="i-lucide-refresh-cw"
        @click="refresh()"
      >
        重试
      </UButton>
    </section>

    <UCard v-else-if="repo" :ui="{ body: 'p-6 sm:p-8' }">
      <!-- 拥有者 -->
      <div class="flex items-center gap-2">
        <UAvatar :src="repo.ownerAvatarUrl" :alt="repo.ownerLogin" size="2xs" loading="lazy" />
        <span class="text-body-sm text-muted">{{ repo.ownerLogin }}</span>
      </div>

      <!-- 项目名 + 外链 -->
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <h1 class="text-display font-semibold tracking-tight text-highlighted">
          {{ repo.name }}
        </h1>
        <ULink
          :to="repo.htmlUrl"
          target="_blank"
          rel="noopener"
          class="inline-flex items-center gap-1 text-body-sm text-primary hover:underline"
        >
          在 GitHub 打开
          <ExternalLink :size="12" />
        </ULink>
      </div>

      <!-- 数据新鲜度：与列表页一致，过期就如实说明 -->
      <UBadge
        v-if="detail?.stale"
        class="mt-3"
        color="warning"
        variant="subtle"
        size="sm"
        icon="i-lucide-alert-triangle"
      >
        数据可能不是最新
      </UBadge>

      <!--
        简介：优先显示 AI 润色版。
        官方原文折叠在下方 —— 润色版是模型的演绎，原文才是作者自己写的事实，
        留一处可对照的入口，比"看起来干净但无从核对"要可靠。
      -->
      <p v-if="displayIntro" class="mt-4 text-body leading-7 text-toned">
        {{ displayIntro }}
      </p>
      <p v-else class="mt-4 text-body leading-7 italic text-muted">
        这个项目还没有填写简介
      </p>

      <UAccordion
        v-if="repo.description"
        class="mt-2"
        :items="[{ label: '查看 GitHub 原简介', content: repo.description }]"
      />

      <!-- 话题标签：详情页展示全部，不像卡片那样只取 3 个 -->
      <div v-if="repo.topics.length > 0" class="mt-5 flex flex-wrap gap-1.5">
        <UBadge
          v-for="topic in repo.topics"
          :key="topic"
          variant="soft"
          color="neutral"
          size="xs"
        >
          {{ topic }}
        </UBadge>
      </div>

      <!-- 元信息 -->
      <div class="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-body-sm text-muted">
        <span class="inline-flex items-center gap-1.5">
          <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ backgroundColor: dotColor }" />
          <span>{{ repo.language ?? '未标注语言' }}</span>
        </span>

        <span class="inline-flex items-center gap-1 tabular-nums">
          <Star :size="14" />
          {{ repo.stargazersCount.toLocaleString() }}
        </span>

        <span class="inline-flex items-center gap-1 tabular-nums">
          <GitFork :size="14" />
          {{ repo.forksCount.toLocaleString() }}
        </span>

        <span>未关闭 issue {{ repo.openIssuesCount.toLocaleString() }}</span>
        <span class="text-dimmed">创建于 {{ formatRelativeTime(repo.createdAt) }}</span>
        <span class="text-dimmed">最近推送 {{ formatRelativeTime(repo.pushedAt) }}</span>
      </div>

      <div class="mt-6 flex flex-wrap items-center gap-3">
        <UButton
          size="sm"
          variant="soft"
          color="primary"
          icon="i-lucide-sparkles"
          @click="ai.askAboutRepo(repo)"
        >
          问 AI
        </UButton>

        <ULink
          v-if="repo.homepage"
          :to="repo.homepage"
          target="_blank"
          rel="noopener"
          class="inline-flex items-center gap-1 text-body-sm text-primary hover:underline"
        >
          项目官网
          <ExternalLink :size="12" />
        </ULink>
      </div>
    </UCard>
  </UContainer>
</template>
