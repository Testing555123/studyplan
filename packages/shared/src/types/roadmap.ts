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
 */

/** 单个学习节点的状态 */
export type CourseStatus = 'completed' | 'in-progress' | 'planned'

/** 一门课 / 一个学习节点 */
export interface Course {
  name: string
  credits: number
  status: CourseStatus
}

/** 一个学期（阶段内的分组） */
export interface Semester {
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
  /** 完成百分比（0–100，已四舍五入）。无节点时为 0，不会除零 */
  percent: number
}
