<script setup lang="ts">
/**
 * 单个学习阶段（对应 v0 的 StageSection）：阶段标题 + 迷你进度 + 学期卡片列表。
 *
 * ── 相比静态版改了三件事 ──
 *   1. 类型统一：删除本文件内联的 Course/Semester 接口（与 shared 重复的定义），
 *      改为直接引用 `@studyplan/shared` —— 同一概念不再有两份实现；
 *   2. 可交互：课程名点击开详情抽屉（emit select），
 *      右侧徽章换成 StatusControl（下拉标记 4 态）；
 *   3. 阶段迷你进度：头部右侧显示本模块"已完成/总数"与进度条。
 *
 * 迷你进度复用同一个 `computeRoadmapProgress`（传单元素数组）——
 * 阶段维度与全局维度走同一份算法，口径永远一致。
 */
import { computeRoadmapProgress } from '@studyplan/shared'
import type { Course, Stage } from '@studyplan/shared'

const props = defineProps<{
  stage: Stage
  index: number
}>()

const emit = defineEmits<{ select: [course: Course] }>()

const { overrides } = useRoadmapState()

const stageProgress = computed(() => computeRoadmapProgress([props.stage], overrides.value))
</script>

<template>
  <!--
    外层卡片由 roadmap.vue 的时间线节点包 .card-surface 提供，
    这里只渲染阶段内容（标题 + 迷你进度 + 学期 .card-surface-sm 网格），
    保持与全站卡片语言同源、且不与时间线序号徽标重复编号。
  -->
  <div>
    <div class="mb-4 flex items-start justify-between gap-4">
      <div class="min-w-0">
        <!--
          模块标识：这一层在数据里叫 Stage，名字却像主题分组（如"前端应用开发"），
          而内层的 Semester 反而叫"阶段 3" —— 两层共用同一套词汇，边界读不出来，
          用户分不清谁包着谁。这里补一枚 eyebrow 先把「这是模块」说清楚，
          而不是去改动那些既有名称（名称不改是本次明确要求）。
          序号直接复用父组件已传入的 index（0 起），不必动数据层。
        -->
        <p class="text-eyebrow font-semibold uppercase tracking-eyebrow text-primary">
          模块 {{ index + 1 }}
        </p>
        <h2 class="mt-1 text-lg font-semibold text-highlighted">{{ stage.title }}</h2>
        <p class="mt-0.5 text-sm text-muted">{{ stage.description }}</p>
      </div>

      <!-- 阶段迷你进度：我的视角（覆盖层已参与计算） -->
      <div class="w-28 shrink-0 text-right">
        <p class="text-caption text-muted">
          {{ stageProgress.completed }}/{{ stageProgress.total }} · {{ stageProgress.percent }}%
        </p>
        <UProgress
          :model-value="stageProgress.percent"
          size="sm"
          class="mt-1.5"
          :aria-label="`模块「${stage.title}」完成进度 ${stageProgress.percent}%`"
        />
      </div>
    </div>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div
        v-for="semester in stage.semesters"
        :key="semester.id"
        class="card-surface-sm"
      >
        <h3 class="mb-3 text-sm font-semibold text-highlighted">{{ semester.name }}</h3>
        <ul class="space-y-2.5">
          <li
            v-for="course in semester.courses"
            :key="course.id"
            class="flex items-center justify-between gap-3 text-sm"
          >
            <!--
              课程名做成按钮打开详情抽屉。hover 下划线 + 主题色给"可点"的反馈，
              状态切换不藏在这里 —— 徽章是徽章，链接是链接，两个 affordance 不混用。
            -->
            <UButton
              type="button"
              color="neutral"
              variant="ghost"
              size="xs"
              class="min-w-0 justify-start px-0 text-body-sm font-medium text-highlighted hover:text-primary hover:underline"
              :aria-label="`查看「${course.name}」详情`"
              @click="emit('select', course)"
            >
              <span class="truncate">{{ course.name }}</span>
            </UButton>
            <RoadmapStatusControl :course="course" class="shrink-0" />
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
