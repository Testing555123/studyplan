<script setup lang="ts">
/**
 * 路线进度头（对应 v0 的 ProgressHeader）：三张统计卡 + 整体进度条。
 *
 * 聚合逻辑来自 `@studyplan/shared` 的 `computeRoadmapProgress`，
 * 与侧栏底部的「学习进度」共用同一份算法与同一份 `stages` 数据 ——
 * 之前这里内联聚合、侧栏写死 42%，两处各算一遍还可能不一致；
 * 现在改走共享函数，路线数据一改，两处会同时、一致地变化。
 */
import type { Stage } from '@studyplan/shared'

const props = defineProps<{ stages: Stage[] }>()

const { total, completed, inProgress, percent } = useRoadmapProgress(() => props.stages)

const stats = computed(() => [
  { label: '学习节点', value: total.value, icon: 'i-lucide-layers', iconClass: 'bg-primary/10 text-primary' },
  { label: '已完成', value: completed.value, icon: 'i-lucide-circle-check-big', iconClass: 'bg-success/10 text-success' },
  { label: '进行中', value: inProgress.value, icon: 'i-lucide-circle-dashed', iconClass: 'bg-info/10 text-info' },
])
</script>

<template>
  <div class="card-surface">
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div
        v-for="stat in stats"
        :key="stat.label"
        class="card-surface-sm flex items-center gap-3"
      >
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm" :class="stat.iconClass">
          <UIcon :name="stat.icon" class="size-[var(--icon-lg)]" />
        </div>
        <div>
          <p class="text-xs text-muted">{{ stat.label }}</p>
          <p class="text-xl font-bold text-highlighted">{{ stat.value }}</p>
        </div>
      </div>
    </div>

    <div class="mt-6">
      <div class="mb-2 flex items-center justify-between text-sm">
        <span class="font-medium text-highlighted">全栈能力进度</span>
        <span class="text-muted">{{ percent }}%</span>
      </div>
      <UProgress :model-value="percent" />
      <p class="mt-2 text-xs text-muted">按 Web 基础、前端、后端与项目交付的学习节点计算。</p>
    </div>
  </div>
</template>
