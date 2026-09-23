/**
 * 学习路线的静态数据与进度聚合。
 *
 * ── 这份数据是"静态占位"，但不是"假数据" ──
 *
 * 路线内容目前仍是人工维护的常量（后端暂无路线接口），
 * 但**进度百分比不再是写死的** —— 它由下文的 `computeRoadmapProgress`
 * 从这份数据实时算出。也就是说：改任何一个节点的 status，
 * 路线页与侧栏会同时、一致地变化。
 *
 * 若将来接后端，只需让这里改为读取接口，调用方无需改动
 * （它们依赖的是 `computeRoadmapProgress` 与 `Stage` 类型，不是这份常量）。
 */
import type { Course, RoadmapProgress, Stage } from '../types/roadmap.js'

export const ROADMAP_STAGES: Stage[] = [
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

/**
 * 把路线摊平成节点并聚合出进度。
 *
 * 这是**唯一**的进度算法：路线页与侧栏都用它，
 * 避免出现"两处各算一遍、结果还不一样"的情况。
 *
 * @param stages 路线数据，默认取 `ROADMAP_STAGES`
 */
export function computeRoadmapProgress(stages: Stage[] = ROADMAP_STAGES): RoadmapProgress {
  const allSteps: Course[] = stages.flatMap(stage => stage.semesters.flatMap(sem => sem.courses))

  const completed = allSteps.filter(c => c.status === 'completed').length
  const inProgress = allSteps.filter(c => c.status === 'in-progress').length
  const planned = allSteps.filter(c => c.status === 'planned').length

  return {
    total: allSteps.length,
    completed,
    inProgress,
    planned,
    // `|| 1` 是为了避免空路线时除零：空路线的进度就是 0，而不是 NaN
    percent: Math.round((completed / (allSteps.length || 1)) * 100),
  }
}
