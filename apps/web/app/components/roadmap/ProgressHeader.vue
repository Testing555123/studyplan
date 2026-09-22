<script setup lang="ts">
/**
 * 路线进度头（对应 v0 的 ProgressHeader）：三张统计卡 + 整体进度条。
 * 数据由父组件传入 stages，这里只做聚合计算与展示。
 * 颜色类用字面量（Tailwind JIT 不识别动态拼接），统计卡配色用 Nuxt UI 语义色。
 */
interface Course {
  name: string
  credits: number
  status: 'completed' | 'in-progress' | 'planned'
}
interface Semester {
  name: string
  courses: Course[]
}
interface Stage {
  id: string
  title: string
  description: string
  semesters: Semester[]
}

const props = defineProps<{ stages: Stage[] }>()

const allSteps = computed(() =>
  props.stages.flatMap(stage => stage.semesters.flatMap(sem => sem.courses)),
)
const completed = computed(() => allSteps.value.filter(c => c.status === 'completed').length)
const inProgress = computed(() => allSteps.value.filter(c => c.status === 'in-progress').length)
const percent = computed(() =>
  Math.round((completed.value / (allSteps.value.length || 1)) * 100),
)

const stats = computed(() => [
  { label: '学习节点', value: allSteps.value.length, icon: 'i-lucide-layers', iconClass: 'bg-primary/10 text-primary' },
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
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" :class="stat.iconClass">
          <UIcon :name="stat.icon" :size="20" />
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
