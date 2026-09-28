<script setup lang="ts">
/**
 * 学习路线页（对应 v0 的 RoadmapPage）。
 *
 * 结构：页头 + ProgressHeader（统计 + 进度 + 下一步）+ 筛选条 + 路线主体。
 *
 * ── 从"静态展示"变成"可用功能"后，这一页只剩三件事 ──
 *   1. 决定主体形态：无筛选条件 → 时间线；有筛选条件 → 扁平结果列表；
 *   2. 持有"当前查看详情的节点"这一个 UI 状态（抽屉开关）；
 *   3. 其余全部下沉：进度聚合在 useRoadmapProgress、
 *      状态读写在 useRoadmapState、过滤在 useRoadmapSearch ——
 *      页面是组装现场，不是实现现场。
 *
 * 路线数据与类型来自 `@studyplan/shared`，渲染时由覆盖层裁决每个节点的
 * 最终状态（徽章/聚合都问 useRoadmapState），侧栏与本页看到同一个"我"。
 */
import { ROADMAP_STAGES } from '@studyplan/shared'
import type { Course, Stage } from '@studyplan/shared'
import type { StatusFilter } from '~/composables/useRoadmapSearch'

useSeoMeta({
  title: '全栈学习路线 · StudyPlan',
  description: '从 Web 基础、前端与后端，到全栈项目交付的完整学习流程，支持记录个人学习进度。',
})

const stages: Stage[] = ROADMAP_STAGES

/** 时间线节点：序号徽标用主色底，slot 供节点卡片与序号内容插槽定位 */
const timelineItems = computed(() =>
  stages.map((stage, i) => ({
    slot: `stage-${i}`,
    avatar: { class: 'bg-primary/10' },
  })),
)

// ── 搜索筛选 ──
const query = ref('')
const statusFilter = ref<StatusFilter>('all')
const { isFiltering, results } = useRoadmapSearch(stages, query, statusFilter)

// ── 详情抽屉：selected 非空即打开 ──
const selected = ref<Course | null>(null)

/** 高亮命中词用的正则（转义防注入）；空查询返回 null 表示不高亮 */
const highlightPattern = computed(() => {
  const q = query.value.trim()
  if (!q) return null
  return new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
})

function highlightSegments(text: string): Array<{ part: string; hit: boolean }> {
  const re = highlightPattern.value
  if (!re) return [{ part: text, hit: false }]
  const segments: Array<{ part: string; hit: boolean }> = []
  let last = 0
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0
    if (start > last) segments.push({ part: text.slice(last, start), hit: false })
    segments.push({ part: m[0], hit: true })
    last = start + m[0].length
  }
  if (last < text.length) segments.push({ part: text.slice(last), hit: false })
  return segments
}
</script>

<template>
  <UContainer class="space-y-6 py-6 md:py-8">
    <BentoCard>
      <p class="text-sm font-medium text-primary">学习流程</p>
      <h1 class="mt-1 text-2xl font-bold text-highlighted">全栈学习路线</h1>
      <p class="mt-1 max-w-2xl text-sm leading-6 text-muted">
        从 Web 基础与工程工具开始，逐步掌握前端应用、后端服务、数据与部署，最终完成可上线的全栈项目。
        点击课程右侧的状态徽章即可记录自己的学习进度。
      </p>
    </BentoCard>

    <RoadmapProgressHeader :stages="stages" @select="selected = $event" />

    <RoadmapFilters v-model:query="query" v-model:status="statusFilter" />

    <!--
      主体两态：筛选生效时切到扁平结果列表（时间线的"阶段感"
      对搜索结果没有意义，用户要的是"哪些命中"），否则回到时间线。
    -->
    <template v-if="isFiltering">
      <BentoCard>
        <p class="text-eyebrow mb-4 font-semibold uppercase tracking-eyebrow text-muted">
          命中 {{ results.length }} 个节点
        </p>

        <ul v-if="results.length" class="space-y-2.5">
          <li
            v-for="hit in results"
            :key="hit.course.id"
            class="flex items-center justify-between gap-3 text-sm"
          >
            <div class="min-w-0">
              <UButton
                type="button"
                color="neutral"
                variant="ghost"
                size="xs"
                class="min-w-0 justify-start px-0 text-body-sm font-medium text-highlighted hover:text-primary hover:underline"
                @click="selected = hit.course"
              >
                <span
                  v-for="(seg, i) in highlightSegments(hit.course.name)"
                  :key="i"
                  :class="seg.hit ? 'rounded-sm bg-warning/20 px-0.5 font-semibold text-highlighted' : ''"
                >{{ seg.part }}</span>
              </UButton>
              <p class="truncate text-caption text-muted">{{ hit.stageTitle }} · {{ hit.semesterName }}</p>
            </div>
            <RoadmapStatusControl :course="hit.course" class="shrink-0" />
          </li>
        </ul>

        <!-- 空结果给"清掉条件"的出口，而不是留一片空白 -->
        <div v-else class="flex flex-col items-center gap-3 py-8 text-center">
          <UIcon name="i-lucide-search-x" class="size-8 text-muted" />
          <p class="text-sm text-muted">没有匹配的学习节点</p>
          <UButton
            color="neutral"
            variant="soft"
            size="xs"
            @click="query = ''; statusFilter = 'all'"
          >
            清除筛选条件
          </UButton>
        </div>
      </BentoCard>
    </template>

    <!-- 阶段用 UTimeline 竖向串联：节点序号徽标用主色，内容卡片落 .card-surface 保持卡片语言一致 -->
    <UTimeline v-else :items="timelineItems" class="mt-2">
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
          <RoadmapStageSection :stage="stage" :index="i" @select="selected = $event" />
        </BentoCard>
      </template>
    </UTimeline>

    <!--
      抽屉走"挂载即展开"的受控模式（与 AiAssistant 同构）：
      v-if 管生死，:open 恒真，关闭 = 父组件把 selected 置空。
    -->
    <RoadmapCourseDetailDrawer
      v-if="selected"
      :course="selected"
      @close="selected = null"
    />
  </UContainer>
</template>
