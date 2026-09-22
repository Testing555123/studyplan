<script setup lang="ts">
/**
 * 学习路线页（对应 v0 的 RoadmapPage）。
 *
 * 结构：页头 + ProgressHeader（统计 + 进度条）+ 各阶段 StageSection。
 * 当前路线为静态占位数据（结构对齐 v0 的 roadmapStages）；
 * 真实路线可后续接后端配置或 @studyplan/shared 类型。
 */
useSeoMeta({
  title: '全栈学习路线 · StudyPlan',
  description: '从 Web 基础、前端与后端，到全栈项目交付的完整学习流程。',
})

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

const stages: Stage[] = [
  {
    id: 'foundation',
    title: 'Web 基础与工具链',
    description: '掌握浏览器基础、编程思维与日常开发工具',
    semesters: [
      {
        name: '阶段 1 · Web 入门',
        courses: [
          { name: 'HTML / CSS 页面结构', credits: 4, status: 'completed' },
          { name: 'JavaScript 核心语法', credits: 5, status: 'completed' },
          { name: 'Git、命令行与调试', credits: 3, status: 'completed' },
        ],
      },
      {
        name: '阶段 2 · 类型化基础',
        courses: [
          { name: 'TypeScript 类型系统', credits: 4, status: 'completed' },
          { name: '数据结构与算法基础', credits: 3, status: 'completed' },
          { name: 'HTTP、浏览器与网络基础', credits: 3, status: 'completed' },
        ],
      },
    ],
  },
  {
    id: 'specialization',
    title: '前端应用开发',
    description: '从组件化界面到可维护、可访问的现代前端应用',
    semesters: [
      {
        name: '阶段 3 · React 工程',
        courses: [
          { name: 'React 与组件设计', credits: 4, status: 'completed' },
          { name: '状态管理与数据请求', credits: 4, status: 'in-progress' },
          { name: 'Tailwind CSS 与设计系统', credits: 3, status: 'in-progress' },
        ],
      },
      {
        name: '阶段 4 · 全栈前端',
        courses: [
          { name: 'Next.js App Router', credits: 4, status: 'in-progress' },
          { name: '表单、测试与可访问性', credits: 3, status: 'in-progress' },
          { name: '性能优化与工程化', credits: 3, status: 'planned' },
        ],
      },
    ],
  },
  {
    id: 'integration',
    title: '后端与全栈交付',
    description: '构建真实服务，连接数据、鉴权与部署，完成可上线项目',
    semesters: [
      {
        name: '阶段 5 · 服务与数据',
        courses: [
          { name: 'Node.js API 与鉴权', credits: 4, status: 'planned' },
          { name: 'SQL、数据库建模与 ORM', credits: 4, status: 'planned' },
          { name: '缓存、队列与错误处理', credits: 3, status: 'planned' },
        ],
      },
      {
        name: '阶段 6 · 项目上线',
        courses: [
          { name: '全栈项目架构与协作', credits: 4, status: 'planned' },
          { name: 'CI/CD、云部署与监控', credits: 3, status: 'planned' },
          { name: '作品集项目复盘', credits: 5, status: 'planned' },
        ],
      },
    ],
  },
]

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
    <div class="card-surface">
      <p class="text-sm font-medium text-primary">学习流程</p>
      <h1 class="mt-1 text-2xl font-bold text-highlighted">全栈学习路线</h1>
      <p class="mt-1 max-w-2xl text-sm leading-6 text-muted">
        从 Web 基础与工程工具开始，逐步掌握前端应用、后端服务、数据与部署，最终完成可上线的全栈项目。
      </p>
    </div>

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
        <div class="card-surface p-6">
          <RoadmapStageSection :stage="stage" :index="i" />
        </div>
      </template>
    </UTimeline>
  </UContainer>
</template>
