<script setup lang="ts">
/**
 * 路线搜索与筛选条。
 *
 * 两个条件都通过 v-model 交给页面（query / status），
 * 组件自身不持有任何过滤逻辑 —— 过滤在 useRoadmapSearch 里，
 * 这里只是它的输入面板。
 *
 * 与帖子页的 TagFilter 同构：触发器外层由页面包 .card-surface-sm，
 * 保持筛选条在不同页面同位置同语义。
 */
import type { StatusFilter } from '~/composables/useRoadmapSearch'

const query = defineModel<string>('query', { required: true })
const status = defineModel<StatusFilter>('status', { required: true })

const statusItems = [
  { label: '全部状态', value: 'all' },
  { label: '已完成', value: 'completed' },
  { label: '进行中', value: 'in-progress' },
  { label: '计划中', value: 'planned' },
  { label: '已跳过', value: 'skipped' },
]
</script>

<template>
  <div class="card-surface-sm flex flex-col gap-3 sm:flex-row sm:items-center">
    <UInput
      v-model="query"
      icon="i-lucide-search"
      placeholder="搜索节点、标签或关键词…"
      class="min-w-0 flex-1"
      size="lg"
      color="neutral"
      variant="outline"
      type="search"
      aria-label="搜索学习节点"
    />
    <USelect
      v-model="status"
      :items="statusItems"
      value-key="value"
      size="lg"
      class="sm:w-40"
      color="neutral"
      variant="outline"
      aria-label="按学习状态筛选"
    />
  </div>
</template>
