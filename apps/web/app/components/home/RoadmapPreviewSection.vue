<script setup lang="ts">
/**
 * 学习路线预览（对应 v0 的 RoadmapPreviewSection）。
 * 竖向时间线 + 圆点；静态占位；wire 阶段接真实路线数据。
 */
const stages = [
  { id: '1', title: '基础奠基', description: '数据结构、算法与计算机基础' },
  { id: '2', title: '专业深化', description: '系统设计、数据库与计算机网络' },
  { id: '3', title: '整合应用', description: '全栈项目实战与上线部署' },
]
</script>

<template>
  <HomeSectionCard icon="i-lucide-route" title="学习路线" href="/roadmap">
    <ol class="relative ml-1.5 space-y-4 border-l border-default pl-5">
      <li v-for="stage in stages" :key="stage.id" class="relative">
        <span class="absolute -left-[25px] top-0.5 h-3 w-3 rounded-full border-2 border-primary bg-default" />
        <h3 class="text-sm font-medium text-highlighted">{{ stage.title }}</h3>
        <p class="mt-0.5 text-xs text-muted">{{ stage.description }}</p>
      </li>
    </ol>
  </HomeSectionCard>
</template>
