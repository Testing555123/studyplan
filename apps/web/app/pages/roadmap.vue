<script setup lang="ts">
/**
 * 学习路线页（对应 v0 的 RoadmapPage）。
 *
 * 结构：页头 + ProgressHeader（统计 + 进度条）+ 各阶段 StageSection。
 *
 * 路线数据与类型来自 `@studyplan/shared`，不再在本页内联定义 ——
 * 侧栏与进度头引用的是同一份数据与同一个进度算法，
 * 改一个节点的状态，两处会一致地变化。
 */
import { ROADMAP_STAGES } from '@studyplan/shared'
import type { Stage } from '@studyplan/shared'

useSeoMeta({
  title: '全栈学习路线 · StudyPlan',
  description: '从 Web 基础、前端与后端，到全栈项目交付的完整学习流程。',
})

const stages: Stage[] = ROADMAP_STAGES

/** 时间线节点：序号徽标用主色底，slot 供节点卡片与序号内容插槽定位 */
const timelineItems = computed(() =>
  stages.map((stage, i) => ({
    slot: `stage-${i}`,
    avatar: { class: 'bg-primary/10' },
  })),
)
</script>

<template>
  <UContainer class="space-y-6 py-6 md:py-8">
    <BentoCard>
      <p class="text-sm font-medium text-primary">学习流程</p>
      <h1 class="mt-1 text-2xl font-bold text-highlighted">全栈学习路线</h1>
      <p class="mt-1 max-w-2xl text-sm leading-6 text-muted">
        从 Web 基础与工程工具开始，逐步掌握前端应用、后端服务、数据与部署，最终完成可上线的全栈项目。
      </p>
    </BentoCard>

    <RoadmapProgressHeader :stages="stages" />

    <!-- 阶段用 UTimeline 竖向串联：节点序号徽标用主色，内容卡片落 .card-surface 保持卡片语言一致 -->
    <UTimeline :items="timelineItems" class="mt-2">
      <template
        v-for="(stage, i) in stages"
        :key="stage.id"
        #[`stage-${i}-indicator`]
      >
        <span class="text-sm font-semibold text-primary">{{ i + 1 }}</span>
      </template>
      <template
        v-for="(stage, i) in stages"
        :key="stage.id"
        #[`stage-${i}-wrapper`]
      >
        <BentoCard>
          <RoadmapStageSection :stage="stage" :index="i" />
        </BentoCard>
      </template>
    </UTimeline>
  </UContainer>
</template>
