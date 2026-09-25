<script setup lang="ts">
/**
 * 路线进度头：统计卡 + 整体进度条 + "下一步"推荐 + 重置入口。
 *
 * 聚合逻辑来自 `@studyplan/shared` 的 `computeRoadmapProgress`，
 * 并带上 useRoadmapProgress 里合并的个人覆盖层 ——
 * 这里显示的永远是"我的"进度（未标记的节点回退官方默认），
 * 与侧栏底部共用同一份算法与同一份数据，两处不可能算出两个数。
 *
 * 重置是**两步确认**（点一下变"确认重置?"，再点才执行）：
 * 毁掉全部个人数据不该只有一个孤零零的按钮，也不该弹原生 confirm。
 */
import { findNextCourse } from '@studyplan/shared'
import type { Course, Stage } from '@studyplan/shared'

const props = defineProps<{ stages: Stage[] }>()

const emit = defineEmits<{ select: [course: Course] }>()

const { total, completed, inProgress, percent, progress } = useRoadmapProgress(() => props.stages)
const { overrides, resetAll } = useRoadmapState()

const stats = computed(() => [
  { label: '学习节点', value: total.value, icon: 'i-lucide-layers', iconClass: 'bg-primary/10 text-primary' },
  { label: '已完成', value: completed.value, icon: 'i-lucide-circle-check-big', iconClass: 'bg-success/10 text-success' },
  { label: '进行中', value: inProgress.value, icon: 'i-lucide-circle-dashed', iconClass: 'bg-info/10 text-info' },
  { label: '已跳过', value: progress.value.skipped, icon: 'i-lucide-circle-slash', iconClass: 'bg-muted text-muted' },
])

/** 下一个该学的节点：按声明顺序第一个未完成/未跳过的。全部完成为 null */
const nextCourse = computed(() => findNextCourse(props.stages, overrides.value))

/** 没有任何个人标记时，不显示重置（没有可重置的东西） */
const hasPersonalProgress = computed(() => Object.keys(overrides.value).length > 0)

const confirmingReset = ref(false)

function onRequestReset(): void {
  if (confirmingReset.value) {
    resetAll()
    confirmingReset.value = false
  } else {
    confirmingReset.value = true
  }
}

/** 离开交互焦点 4 秒后自动退出确认态，避免"忘了按、下次误触" */
let resetTimer: ReturnType<typeof setTimeout> | undefined
watch(confirmingReset, on => {
  clearTimeout(resetTimer)
  if (on) resetTimer = setTimeout(() => (confirmingReset.value = false), 4000)
})
onUnmounted(() => clearTimeout(resetTimer))
</script>

<template>
  <div class="card-surface">
    <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
        <span class="font-medium text-highlighted">全栈能力进度（我的）</span>
        <span class="text-muted">{{ percent }}%</span>
      </div>
      <UProgress :model-value="percent" />
      <p class="mt-2 text-xs text-muted">
        按 Web 基础、前端、后端与项目交付的学习节点计算；点击课程右侧徽章即可记录自己的状态。
      </p>
    </div>

    <!-- 下一步推荐 + 重置：同一行的两端，左边是"继续"，右边是"清零" -->
    <div class="mt-6 flex flex-col gap-3 border-t border-default pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div v-if="nextCourse" class="flex min-w-0 items-center gap-3">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-ai/10 text-ai">
          <UIcon name="i-lucide-corner-down-right" class="size-[var(--icon-lg)]" />
        </div>
        <div class="min-w-0">
          <p class="text-xs text-muted">下一步建议</p>
          <p class="truncate text-sm font-semibold text-highlighted">{{ nextCourse.name }}</p>
        </div>
        <UButton
          color="primary"
          variant="soft"
          size="xs"
          class="shrink-0"
          trailing-icon="i-lucide-arrow-right"
          @click="emit('select', nextCourse)"
        >
          看看学什么
        </UButton>
      </div>
      <p v-else class="text-sm font-medium text-success">
        全部节点已完成 —— 跳过的节点可在各自徽章处恢复。
      </p>

      <UButton
        v-if="hasPersonalProgress"
        :color="confirmingReset ? 'error' : 'neutral'"
        variant="ghost"
        size="xs"
        icon="i-lucide-rotate-ccw"
        class="self-start sm:self-auto"
        @click="onRequestReset"
      >
        {{ confirmingReset ? '确认重置？' : '重置我的进度' }}
      </UButton>
    </div>
  </div>
</template>
