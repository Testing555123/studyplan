<script setup lang="ts">
/**
 * 课程状态徽章（对应 v0 的 StatusBadge）。
 * 用 Nuxt UI 的 color prop（success/info/warning/neutral），语义色由组件内部处理，
 * 避免手写动态 class 导致 Tailwind 无法生成。
 *
 * 刻意保持"纯展示"：状态从哪来（官方默认还是用户覆盖）由调用方裁决，
 * 交互（下拉切换）也包在调用方那里 —— 徽章不知道自己会被点击。
 */
import type { CourseStatus } from '@studyplan/shared'

defineProps<{ status: CourseStatus }>()

const map: Record<CourseStatus, { label: string; color: 'success' | 'info' | 'warning' | 'neutral' }> = {
  completed: { label: '已完成', color: 'success' },
  'in-progress': { label: '进行中', color: 'info' },
  planned: { label: '计划中', color: 'warning' },
  skipped: { label: '已跳过', color: 'neutral' },
}
</script>

<template>
  <UBadge :color="map[status].color" variant="subtle" size="xs" class="font-medium">
    {{ map[status].label }}
  </UBadge>
</template>
