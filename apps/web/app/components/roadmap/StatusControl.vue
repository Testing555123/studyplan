<script setup lang="ts">
/**
 * 节点状态的交互控件：点击徽章弹出下拉，直接选目标状态。
 *
 * ── 为什么是"选状态"而不是"点击循环" ──
 *
 * 循环切换（planned → in-progress → completed → …）看起来省一个菜单，
 * 但它要求用户心算"现在是什么、点几下到我要的"，而且永远到不了
 * 上一个状态之前的那一档。下拉直接给 4 个目标，一步到位、可预期。
 *
 * 三处复用同一个控件：时间线课程行、搜索结果行、详情抽屉。
 * 状态读写都走 useRoadmapState，这里只是它的皮肤。
 */
import type { Course, CourseStatus } from '@studyplan/shared'

const props = defineProps<{ course: Course }>()

const { statusOf, isOverridden, setStatus, resetCourse } = useRoadmapState()

const OPTIONS: Array<{ value: CourseStatus; label: string; icon: string }> = [
  { value: 'completed', label: '已完成', icon: 'i-lucide-circle-check-big' },
  { value: 'in-progress', label: '进行中', icon: 'i-lucide-circle-dashed' },
  { value: 'planned', label: '计划中', icon: 'i-lucide-circle' },
  { value: 'skipped', label: '已跳过', icon: 'i-lucide-circle-slash' },
]

const items = computed(() => {
  const current = statusOf(props.course)

  const statusGroup = OPTIONS.map(option => ({
    label: option.label,
    icon: option.value === current ? 'i-lucide-check' : option.icon,
    // 当前状态不再显示自己的图标，换成勾，菜单里一眼能读出"现在是哪个"
    onSelect: () => setStatus(props.course.id, option.value),
  }))

  if (!isOverridden(props.course.id)) return [statusGroup]

  // 只有用户确实标记过，才出现"恢复官方默认" —— 不给无效操作留入口
  return [
    statusGroup,
    [
      {
        label: '恢复官方默认',
        icon: 'i-lucide-rotate-ccw',
        onSelect: () => resetCourse(props.course.id),
      },
    ],
  ]
})
</script>

<template>
  <UDropdownMenu :items="items">
    <button
      type="button"
      class="cursor-pointer rounded-full transition-transform hover:scale-105"
      :aria-label="`标记「${course.name}」的学习状态`"
    >
      <RoadmapStatusBadge :status="statusOf(course)" />
    </button>
  </UDropdownMenu>
</template>
