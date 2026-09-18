<script setup lang="ts">
/**
 * 课程状态徽章（对应 v0 的 StatusBadge）。
 * 用 Nuxt UI 的 color prop（success/info/warning），语义色由组件内部处理，
 * 避免手写动态 class 导致 Tailwind 无法生成。
 */
type CourseStatus = 'completed' | 'in-progress' | 'planned'

const props = defineProps<{ status: CourseStatus }>()

const map: Record<CourseStatus, { label: string; color: 'success' | 'info' | 'warning' }> = {
  completed: { label: '已完成', color: 'success' },
  'in-progress': { label: '进行中', color: 'info' },
  planned: { label: '计划中', color: 'warning' },
}
</script>

<template>
  <UBadge :color="map[status].color" variant="subtle" size="xs" class="font-medium">
    {{ map[status].label }}
  </UBadge>
</template>
