/**
 * 学习路线的对外契约。
 *
 * ── 为什么要把它放进 shared，而不是留在页面里 ──
 *
 * 路线的进度原本在两处各算各的：
 *   · /roadmap 页的 ProgressHeader —— 真实聚合计算；
 *   · 侧栏底部卡片 —— 写死一个 "42%"。
 * 两者来自同一份事实，却给出两个互不相关的数字。
 * 这种"同一个概念有两份实现"正是最容易产生分歧的地方：
 * 路线内容一改，侧栏那个数字不会跟着变，而且不报任何错。
 *
 * 所以把类型、数据与聚合函数都放进来，前后端与所有 UI 引用同一份定义。
 *
 * ── 从"静态展示"到"可用功能"引入的核心模型：覆盖层（overrides） ──
 *
 * 借鉴 roadmap.sh 的做法：**官方路线是只读模板，个人进度是独立覆盖层**。
 * `ROADMAP_STAGES` 里的 `status` 从此只有一个含义 —— 官方默认状态（作者视角）；
 * 用户标记的状态存在 `RoadmapOverrides` 里，按节点 id 关联、只存差异。
 * 渲染与聚合时用 `resolveCourseStatus` 合并两者。
 * 这样路线内容更新不会冲掉用户数据，用户数据也不会伪装成路线内容。
 */

/** 单个学习节点的状态（对齐 roadmap.sh 的 4 态：done / in-progress / to-do / skipped） */
export type CourseStatus = 'completed' | 'in-progress' | 'planned' | 'skipped'

/** 全部合法状态。后端 DTO 用它做白名单校验，前后端共享同一份枚举 */
export const COURSE_STATUSES: readonly CourseStatus[] = [
  'completed',
  'in-progress',
  'planned',
  'skipped',
]

/** 节点的推荐学习资源 */
export interface CourseResource {
  title: string
  url: string
  type: 'doc' | 'course' | 'book' | 'video'
}

/** 一门课 / 一个学习节点 */
export interface Course {
  /**
   * 稳定 slug（如 'ts-types'）。用户覆盖层、云同步都按它关联。
   *
   * ⚠️ 这是所有交互功能的地基：`name` 是给人看的文案，随时可能改；
   * 用 name 当键，文案一改用户数据就成孤儿。id 一经发布不再变更。
   */
  id: string
  name: string
  credits: number
  /** 官方默认状态（路线作者视角）。用户标记的状态见 RoadmapOverrides */
  status: CourseStatus
  /** 学什么 —— 详情抽屉的正文 */
  description?: string
  /** 难度：1 入门 / 2 进阶 / 3 深入 */
  difficulty?: 1 | 2 | 3
  /** 检索标签，如 ['typescript', 'tooling']，供搜索筛选使用 */
  tags?: string[]
  /** 前置节点的 id 列表 */
  prerequisites?: string[]
  /** 推荐资源 */
  resources?: CourseResource[]
  /** 预计投入小时数，供学习计划功能使用 */
  estHours?: number
}

/** 一个学期（阶段内的分组）。数组顺序即学习顺序 */
export interface Semester {
  id: string
  name: string
  courses: Course[]
}

/** 一个大阶段 */
export interface Stage {
  id: string
  title: string
  description: string
  semesters: Semester[]
}

/**
 * 用户状态覆盖层：courseId → 用户标记的状态 + 最后变更时间。
 *
 * 只存差异，不复制整棵路线 —— 未操作过的节点不落任何数据。
 * `updatedAt` 用于本地/云端合并时的逐节点 LWW（last-write-wins）。
 */
export type RoadmapOverrides = Record<string, { status: CourseStatus; updatedAt: string }>

/** 聚合后的路线进度 */
export interface RoadmapProgress {
  /** 学习节点总数 */
  total: number
  /** 已完成数 */
  completed: number
  /** 进行中数 */
  inProgress: number
  /** 未开始数 */
  planned: number
  /** 已跳过数 */
  skipped: number
  /**
   * 完成百分比（0–100，已四舍五入）。
   * 分母剔除 skipped —— 跳过的节点既不算完成也不该拉低进度，
   * 这与 roadmap.sh 的 ignored 语义一致。无有效节点时为 0，不会除零。
   */
  percent: number
}

/**
 * GET /roadmap/progress 的响应契约（需登录）。
 * 覆盖层 + 服务端算好的聚合，前端拿来即可合并展示。
 */
export interface RoadmapProgressResponse {
  steps: RoadmapOverrides
  progress: RoadmapProgress
}

/** PUT /roadmap/progress/:courseId 的请求体契约（幂等：表达"目标状态"而非"切换"） */
export interface SetCourseStatusPayload {
  status: CourseStatus
}
