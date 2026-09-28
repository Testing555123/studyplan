/**
 * 学习路线的静态数据与进度聚合。
 *
 * ── 这份数据是"官方模板"，不是"某个人的进度" ──
 *
 * 路线内容仍是人工维护的常量（改动走 Git 审查，SSR 零请求），
 * 但节点上的 `status` 从"用户的真相"降级为"官方默认状态"：
 * 它表示路线作者的建议进度，访问者自己的标记存在**覆盖层**里
 * （类型见 `RoadmapOverrides`），聚合时由 `computeRoadmapProgress`
 * 通过 `resolveCourseStatus` 逐节点合并。
 *
 * 于是同一份数据同时服务两种视角：
 *   · 未操作过的访客：看到官方默认进度；
 *   · 标记过节点的用户：看到自己的真实进度。
 * 两处永远走同一个算法，不会出现"各算一遍、结果不一样"。
 */
import type {
  Course,
  CourseStatus,
  RoadmapOverrides,
  RoadmapProgress,
  Stage,
} from '../types/roadmap.js'

/**
 * 路线数据版本号。
 *
 * 节点的 id / 结构发生**破坏性变更**时 +1。
 * 本地缓存（localStorage）的键带版本号，旧版本数据自然失效；
 * 云端覆盖层也存这个值，供服务端将来做迁移判断。
 */
export const ROADMAP_VERSION = 1

export const ROADMAP_STAGES: Stage[] = [
  {
    id: 'foundation',
    title: 'Web 基础与工具链',
    description: '掌握浏览器基础、编程思维与日常开发工具',
    semesters: [
      {
        id: 'sem-1',
        name: '阶段 1 · Web 入门',
        courses: [
          {
            id: 'html-css',
            name: 'HTML / CSS 页面结构',
            credits: 4,
            status: 'completed',
            difficulty: 1,
            estHours: 30,
            tags: ['html', 'css', 'web'],
            description:
              '语义化标签、盒模型、Flex / Grid 布局与响应式设计，能独立还原常见页面结构。',
            resources: [
              { title: 'MDN：学习 Web 开发', url: 'https://developer.mozilla.org/zh-CN/docs/Learn', type: 'doc' },
              { title: 'web.dev：Learn CSS', url: 'https://web.dev/learn/css/', type: 'course' },
            ],
          },
          {
            id: 'js-core',
            name: 'JavaScript 核心语法',
            credits: 5,
            status: 'completed',
            difficulty: 1,
            estHours: 40,
            tags: ['javascript', 'web'],
            description:
              '类型系统、作用域与闭包、原型与 class、异步（事件循环 / Promise / async-await），建立语言层面的完整心智模型。',
            resources: [
              { title: 'JavaScript 教程（中文）', url: 'https://zh.javascript.info/', type: 'course' },
              { title: 'Eloquent JavaScript', url: 'https://eloquentjavascript.net/', type: 'book' },
            ],
          },
          {
            id: 'git-cli',
            name: 'Git、命令行与调试',
            credits: 3,
            status: 'completed',
            difficulty: 1,
            estHours: 20,
            tags: ['git', 'tooling', 'debugging'],
            description:
              '分支模型与三方合并、rebase 与冲突处理、常用 Shell 操作、浏览器 DevTools 断点与性能面板。',
            resources: [
              { title: 'Pro Git（中文版）', url: 'https://git-scm.com/book/zh/v2', type: 'book' },
              { title: 'GitHub Skills', url: 'https://skills.github.com/', type: 'course' },
            ],
          },
        ],
      },
      {
        id: 'sem-2',
        name: '阶段 2 · 类型化基础',
        courses: [
          {
            id: 'ts-types',
            name: 'TypeScript 类型系统',
            credits: 4,
            status: 'completed',
            difficulty: 2,
            estHours: 25,
            tags: ['typescript', 'tooling'],
            prerequisites: ['js-core'],
            description:
              '类型注解与推断、interface / 泛型、联合与收窄、strict 模式的价值，以及为什么共享契约能让前后端类型一致。',
            resources: [
              { title: 'TypeScript 官方手册', url: 'https://www.typescriptlang.org/docs/handbook/intro.html', type: 'doc' },
              { title: 'TypeScript Deep Dive', url: 'https://basarat.gitbook.io/typescript', type: 'book' },
            ],
          },
          {
            id: 'ds-algo',
            name: '数据结构与算法基础',
            credits: 3,
            status: 'completed',
            difficulty: 2,
            estHours: 35,
            tags: ['algorithm', 'cs-basics'],
            prerequisites: ['js-core'],
            description:
              '数组 / 哈希表 / 栈队列 / 树与图的常见操作，复杂度分析的思维方式，覆盖面试与日常写代码的双重需要。',
            resources: [
              { title: 'Visualgo（算法可视化）', url: 'https://visualgo.net/zh', type: 'doc' },
              { title: 'Hello 算法（JS 版）', url: 'https://www.hello-algo.com/chapter_array_and_linkedlist/', type: 'book' },
            ],
          },
          {
            id: 'http-network',
            name: 'HTTP、浏览器与网络基础',
            credits: 3,
            status: 'completed',
            difficulty: 1,
            estHours: 15,
            tags: ['http', 'network', 'web'],
            prerequisites: ['html-css'],
            description:
              '请求 / 响应模型、状态码语义、缓存头、跨域与 Cookie —— 后面联调、鉴权、性能优化全都建立在这份基础上。',
            resources: [
              { title: 'MDN：HTTP 概览', url: 'https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Overview', type: 'doc' },
              { title: 'High Performance Browser Networking', url: 'https://hpbn.co/', type: 'book' },
            ],
          },
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
        id: 'sem-3',
        name: '阶段 3 · React 工程',
        courses: [
          {
            id: 'react-basics',
            name: 'React 与组件设计',
            credits: 4,
            status: 'completed',
            difficulty: 2,
            estHours: 30,
            tags: ['react', 'frontend'],
            prerequisites: ['js-core', 'ts-types'],
            description:
              'JSX 与渲染机制、props / state 的边界、组合优于继承、Effect 的正确用法与常见误区。',
            resources: [
              { title: 'React 官方文档（新版）', url: 'https://react.dev/learn', type: 'doc' },
              { title: 'Thinking in React', url: 'https://react.dev/learn/thinking-in-react', type: 'doc' },
            ],
          },
          {
            id: 'state-data',
            name: '状态管理与数据请求',
            credits: 4,
            status: 'in-progress',
            difficulty: 2,
            estHours: 25,
            tags: ['react', 'state', 'data-fetching'],
            prerequisites: ['react-basics'],
            description:
              '区分"客户端状态"与"服务端缓存"，掌握 Pinia / Zustand 一类的 store 设计，理解请求去重、乐观更新与失效重取。',
            resources: [
              { title: 'Pinia 官方文档', url: 'https://pinia.vuejs.org/introduction.html', type: 'doc' },
              { title: 'TanStack Query 理念', url: 'https://tanstack.com/query/latest/docs/framework/react/overview', type: 'doc' },
            ],
          },
          {
            id: 'tailwind-ds',
            name: 'Tailwind CSS 与设计系统',
            credits: 3,
            status: 'in-progress',
            difficulty: 2,
            estHours: 20,
            tags: ['css', 'design-system', 'tailwind'],
            prerequisites: ['html-css'],
            description:
              '工具类思维、设计令牌（token）如何映射成主题变量、暗色模式与语义色的组织方式。',
            resources: [
              { title: 'Tailwind CSS 文档', url: 'https://tailwindcss.com/docs/installation', type: 'doc' },
              { title: 'Nuxt UI 主题指南', url: 'https://ui.nuxt.com/getting-started/theme/design-system', type: 'doc' },
            ],
          },
        ],
      },
      {
        id: 'sem-4',
        name: '阶段 4 · 全栈前端',
        courses: [
          {
            id: 'nextjs-router',
            name: 'Next.js App Router',
            credits: 4,
            status: 'in-progress',
            difficulty: 3,
            estHours: 30,
            tags: ['react', 'fullstack', 'ssr'],
            prerequisites: ['react-basics', 'state-data'],
            description:
              '服务端渲染与混合渲染、文件路由、数据获取边界、缓存层 —— 以及本项目等价的 Nuxt 4 是怎么落这些概念的。',
            resources: [
              { title: 'Next.js 官方文档', url: 'https://nextjs.org/docs', type: 'doc' },
              { title: 'Nuxt 4 渲染策略', url: 'https://nuxt.com/docs/guide/concepts/rendering', type: 'doc' },
            ],
          },
          {
            id: 'forms-a11y',
            name: '表单、测试与可访问性',
            credits: 3,
            status: 'in-progress',
            difficulty: 2,
            estHours: 25,
            tags: ['forms', 'testing', 'a11y'],
            prerequisites: ['react-basics'],
            description:
              '受控表单与校验、键盘可达性与 ARIA 语义、用 Playwright 覆盖关键路径的测试写法。',
            resources: [
              { title: 'WAI-ARIA 表单模式', url: 'https://www.w3.org/WAI/ARIA/apg/patternens/forms/', type: 'doc' },
              { title: 'Playwright 官方文档', url: 'https://playwright.dev/docs/intro', type: 'doc' },
            ],
          },
          {
            id: 'perf-eng',
            name: '性能优化与工程化',
            credits: 3,
            status: 'planned',
            difficulty: 3,
            estHours: 25,
            tags: ['performance', 'engineering'],
            prerequisites: ['nextjs-router'],
            description:
              'Core Web Vitals 指标怎么读、打包产物分析、代码分割与预取、ESLint / CI 如何守住工程质量。',
            resources: [
              { title: 'web.dev：性能', url: 'https://web.dev/articles/vitals', type: 'doc' },
              { title: 'Chrome DevTools 性能面板', url: 'https://developer.chrome.com/docs/devtools/performance', type: 'doc' },
            ],
          },
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
        id: 'sem-5',
        name: '阶段 5 · 服务与数据',
        courses: [
          {
            id: 'node-api-auth',
            name: 'Node.js API 与鉴权',
            credits: 4,
            status: 'planned',
            difficulty: 2,
            estHours: 30,
            tags: ['node', 'api', 'auth'],
            prerequisites: ['http-network', 'ts-types'],
            description:
              'REST 资源建模、NestJS 模块与依赖注入、bcrypt 与 JWT 双 Token、httpOnly Cookie 为什么是默认选择。',
            resources: [
              { title: 'NestJS 官方文档', url: 'https://docs.nestjs.com/', type: 'doc' },
              { title: 'JWT 简介（jwt.io）', url: 'https://jwt.io/introduction', type: 'doc' },
            ],
          },
          {
            id: 'sql-orm',
            name: 'SQL、数据库建模与 ORM',
            credits: 4,
            status: 'planned',
            difficulty: 2,
            estHours: 30,
            tags: ['database', 'sql', 'mongodb'],
            prerequisites: ['node-api-auth'],
            description:
              '关系建模与内嵌取舍、索引原理与复合索引前缀规则、用 Mongoose / Prisma 一类 ODM 落建模决策。',
            resources: [
              { title: 'MongoDB 数据建模', url: 'https://www.mongodb.com/docs/manual/data-modeling/', type: 'doc' },
              { title: 'SQLBolt（交互式 SQL 教程）', url: 'https://sqlbolt.com/', type: 'course' },
            ],
          },
          {
            id: 'cache-queue',
            name: '缓存、队列与错误处理',
            credits: 3,
            status: 'planned',
            difficulty: 3,
            estHours: 25,
            tags: ['backend', 'cache', 'reliability'],
            prerequisites: ['node-api-auth'],
            description:
              '缓存失效策略、把慢任务挪出请求路径的队列思想、超时 / 重试 / 降级，以及"AI 是旁路不是主链路"。',
            resources: [
              { title: 'Redis 使用场景', url: 'https://redis.io/docs/latest/develop/data-types/compare-data-structures/', type: 'doc' },
              { title: 'Google SRE 手册（错误处理）', url: 'https://sre.google/sre-book/monitoring-distributed-systems/', type: 'book' },
            ],
          },
        ],
      },
      {
        id: 'sem-6',
        name: '阶段 6 · 项目上线',
        courses: [
          {
            id: 'fullstack-arch',
            name: '全栈项目架构与协作',
            credits: 4,
            status: 'planned',
            difficulty: 3,
            estHours: 30,
            tags: ['architecture', 'monorepo', 'fullstack'],
            prerequisites: ['nextjs-router', 'node-api-auth'],
            description:
              'monorepo 与共享契约的价值、同域部署为什么省事、前后端接口怎么版本化演进、团队怎么按同一套模式协作。',
            resources: [
              { title: '本仓库 01-project-structure 文档', url: 'https://github.com/', type: 'doc' },
              { title: 'Patterns: Shared Contracts', url: 'https://martinfowler.com/architecture/', type: 'doc' },
            ],
          },
          {
            id: 'cicd-cloud',
            name: 'CI/CD、云部署与监控',
            credits: 3,
            status: 'planned',
            difficulty: 2,
            estHours: 25,
            tags: ['devops', 'ci-cd', 'monitoring'],
            prerequisites: ['git-cli'],
            description:
              '流水线该拦什么、容器镜像构建的缓存层次、环境变量如何区分开发与生产、上线后看哪些指标。',
            resources: [
              { title: 'GitHub Actions 文档', url: 'https://docs.github.com/actions', type: 'doc' },
              { title: 'Vercel 部署指南', url: 'https://vercel.com/docs/deployments/overview', type: 'doc' },
            ],
          },
          {
            id: 'portfolio-review',
            name: '作品集项目复盘',
            credits: 5,
            status: 'planned',
            difficulty: 3,
            estHours: 40,
            tags: ['career', 'review', 'interview'],
            prerequisites: ['fullstack-arch', 'cicd-cloud'],
            description:
              '把一个真实项目讲成三件事：怎么拆的、踩了什么坑、为什么这样选。输出面试可用的项目叙述与技术决策记录。',
            resources: [
              { title: 'README 写作指南', url: 'https://www.makeareadme.com/', type: 'doc' },
              { title: 'Ampersand 工程博客（复盘范例）', url: 'https://amberskywave.github.io/', type: 'doc' },
            ],
          },
        ],
      },
    ],
  },
]

/**
 * 全部合法节点 id 的白名单（由路线数据派生，不手工维护）。
 * 后端用它校验"课程 id 是否存在"，防止脏数据写进覆盖层。
 */
export const ROADMAP_COURSE_IDS: readonly string[] = ROADMAP_STAGES.flatMap(stage =>
  stage.semesters.flatMap(sem => sem.courses.map(course => course.id)),
)

/** 某个节点是否属于当前路线（未知 id 的判定交给调用方决定如何处置） */
export function isKnownCourseId(courseId: string): boolean {
  return ROADMAP_COURSE_IDS.includes(courseId)
}

/** 按 id 查节点（前置依赖渲染、详情定位用）；不存在返回 null */
export function findCourseById(
  courseId: string,
  stages: Stage[] = ROADMAP_STAGES,
): Course | null {
  for (const stage of stages) {
    for (const sem of stage.semesters) {
      for (const course of sem.courses) {
        if (course.id === courseId) return course
      }
    }
  }
  return null
}

/**
 * 单个节点的最终状态 = 用户覆盖层 ?? 官方默认。
 *
 * 这是**唯一**的裁决函数：渲染徽标、算进度、推荐下一步都问它，
 * 这样"最终状态"的定义将来只改一处（比如接入云同步后加合并规则）。
 */
export function resolveCourseStatus(
  course: Course,
  overrides?: RoadmapOverrides,
): CourseStatus {
  return overrides?.[course.id]?.status ?? course.status
}

/**
 * 把路线摊平成节点、按覆盖层解析状态，再聚合出进度。
 *
 * 这是**唯一**的进度算法：路线页、侧栏与后端都调用它，
 * 避免出现"两处各算一遍、结果还不一样"的情况。
 *
 * 规则（有单测钉死）：
 *   · `overrides` 里的未知 courseId 静默忽略（路线删节点后旧数据不炸）；
 *   · skipped 不计入 completed，也从百分比分母中剔除；
 *   · 空路线 / 全部跳过时分母按 1 兜底，percent 为 0 而不是 NaN。
 *
 * @param stages    路线数据，默认取 `ROADMAP_STAGES`
 * @param overrides 用户状态覆盖层，不传则完全按官方默认聚合
 */
export function computeRoadmapProgress(
  stages: Stage[] = ROADMAP_STAGES,
  overrides?: RoadmapOverrides,
): RoadmapProgress {
  const allSteps: Course[] = stages.flatMap(stage => stage.semesters.flatMap(sem => sem.courses))

  const statuses = allSteps.map(course => resolveCourseStatus(course, overrides))

  const completed = statuses.filter(s => s === 'completed').length
  const inProgress = statuses.filter(s => s === 'in-progress').length
  const planned = statuses.filter(s => s === 'planned').length
  const skipped = statuses.filter(s => s === 'skipped').length

  // 分母剔除 skipped；`|| 1` 兜底"全部跳过 / 空路线"，避免除零得到 NaN
  const effective = allSteps.length - skipped

  return {
    total: allSteps.length,
    completed,
    inProgress,
    planned,
    skipped,
    percent: Math.round((completed / (effective || 1)) * 100),
  }
}

/**
 * 按路线顺序找"下一个该学的节点"：
 * 第一个既未完成也未跳过的节点（即 in-progress 优先、其次 planned）。
 *
 * 顺序语义 = 声明顺序（stage → semester → course 的嵌套数组顺序），
 * 与"数组顺序即学习顺序"的约定一致。全部完成时返回 null。
 */
export function findNextCourse(
  stages: Stage[] = ROADMAP_STAGES,
  overrides?: RoadmapOverrides,
): Course | null {
  for (const stage of stages) {
    for (const sem of stage.semesters) {
      for (const course of sem.courses) {
        const status = resolveCourseStatus(course, overrides)
        if (status !== 'completed' && status !== 'skipped') return course
      }
    }
  }
  return null
}
