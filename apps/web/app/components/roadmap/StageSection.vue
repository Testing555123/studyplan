<script setup lang="ts">
/**
 * 单个学习阶段（对应 v0 的 StageSection）：阶段标题 + 阶段内学期卡片列表。
 * 学期卡片用语义色边框/背景，hover 轻微变化；课程行右侧用 StatusBadge 标状态。
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

defineProps<{
  stage: { id: string; title: string; description: string; semesters: Semester[] }
  index: number
}>()
</script>

<template>
  <section>
    <div class="mb-4 flex items-center gap-3">
      <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
        {{ index + 1 }}
      </div>
      <div>
        <h2 class="text-lg font-semibold text-highlighted">
          {{ index + 1 }}. {{ stage.title }}
        </h2>
        <p class="text-sm text-muted">{{ stage.description }}</p>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div
        v-for="semester in stage.semesters"
        :key="semester.name"
        class="rounded-xl border border-default bg-default p-4 shadow-sm transition-colors duration-200 hover:bg-muted/60 md:p-5"
      >
        <h3 class="mb-3 text-sm font-semibold text-highlighted">{{ semester.name }}</h3>
        <ul class="space-y-2.5">
          <li
            v-for="course in semester.courses"
            :key="course.name"
            class="flex items-center justify-between gap-3 text-sm"
          >
            <span class="text-highlighted">{{ course.name }}</span>
            <RoadmapStatusBadge :status="course.status" />
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
