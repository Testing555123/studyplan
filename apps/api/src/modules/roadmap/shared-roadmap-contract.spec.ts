/**
 * shared 学习路线契约（纯函数）的单测。
 *
 * ── 为什么"shared 的测试"住在 apps/api 里 ──
 *
 * shared 包本身没有测试设施（它只有类型、常量与纯函数）；
 * 而 api 的 jest 通过 moduleNameMapper 把 `@studyplan/shared`
 * 直接映射到源码（见 apps/api/jest.config.js），改契约立刻能测，
 * 不需要为几个纯函数单独搭一套 runner。这是刻意的就近安排。
 *
 * 钉死的行为契约（前端、后端、本地缓存三方都依赖这些语义）：
 *   · 覆盖层优先于官方默认，未覆盖节点回退默认；
 *   · 未知 courseId 静默忽略；
 *   · skipped 不计完成、并从百分比分母剔除；
 *   · 空路线 / 全跳过不产生 NaN；
 *   · findNextCourse 按声明顺序取第一个未完成未跳过节点。
 */
import {
  ROADMAP_COURSE_IDS,
  ROADMAP_STAGES,
  computeRoadmapProgress,
  findCourseById,
  findNextCourse,
  isKnownCourseId,
  resolveCourseStatus,
} from '@studyplan/shared'
import type { CourseStatus, RoadmapOverrides, Stage } from '@studyplan/shared'

/** 造一个只含给定节点的测试路线 */
function stagesWith(courses: Array<{ id: string; status: CourseStatus }>): Stage[] {
  return [
    {
      id: 'test',
      title: '测试阶段',
      description: '',
      semesters: [
        {
          id: 'sem-test',
          name: '测试学期',
          courses: courses.map(c => ({
            id: c.id,
            name: c.id,
            credits: 1,
            status: c.status,
          })),
        },
      ],
    },
  ]
}

function entry(status: CourseStatus, at = '2026-01-01T00:00:00.000Z'): RoadmapOverrides[string] {
  return { status, updatedAt: at }
}

describe('resolveCourseStatus', () => {
  it('覆盖层存在时优先，否则回退官方默认', () => {
    const course = { id: 'a', name: 'A', credits: 1, status: 'planned' as const }

    expect(resolveCourseStatus(course, { a: entry('completed') })).toBe('completed')
    expect(resolveCourseStatus(course, {})).toBe('planned')
    expect(resolveCourseStatus(course, undefined)).toBe('planned')
  })
})

describe('computeRoadmapProgress（覆盖层语义）', () => {
  it('不传覆盖层时等于官方默认聚合', () => {
    expect(computeRoadmapProgress(ROADMAP_STAGES)).toEqual(
      computeRoadmapProgress(ROADMAP_STAGES, {}),
    )
  })

  it('覆盖层把 planned 变 completed 时，completed 与 percent 同步上升', () => {
    const official = computeRoadmapProgress(ROADMAP_STAGES)
    const plannedCourse = ROADMAP_STAGES[2].semesters[0].courses[0] // 阶段 5 首节点，官方 planned

    const mine = computeRoadmapProgress(ROADMAP_STAGES, {
      [plannedCourse.id]: entry('completed'),
    })

    expect(mine.completed).toBe(official.completed + 1)
    expect(mine.planned).toBe(official.planned - 1)
    expect(mine.percent).toBeGreaterThan(official.percent)
  })

  it('未知 courseId 静默忽略（路线删节点后旧缓存不炸）', () => {
    const withUnknown = computeRoadmapProgress(ROADMAP_STAGES, {
      'node-deleted-long-ago': entry('completed'),
    })

    expect(withUnknown).toEqual(computeRoadmapProgress(ROADMAP_STAGES))
  })

  it('skipped 不计入完成数，且从百分比分母中剔除', () => {
    const stages = stagesWith([
      { id: 'a', status: 'completed' },
      { id: 'b', status: 'planned' },
      { id: 'c', status: 'planned' },
    ])

    // b 跳过：分母从 3 变 2，percent 从 33 跳到 50，completed 仍是 1
    const withSkip = computeRoadmapProgress(stages, { b: entry('skipped') })
    expect(withSkip.completed).toBe(1)
    expect(withSkip.skipped).toBe(1)
    expect(withSkip.percent).toBe(50)
  })

  it('空路线 percent 为 0 而不是 NaN（除零兜底）', () => {
    const empty = computeRoadmapProgress([])
    expect(empty.total).toBe(0)
    expect(empty.percent).toBe(0)
  })

  it('全部跳过时 percent 为 0 而不是 NaN（分母清零的除零兜底）', () => {
    const stages = stagesWith([
      { id: 'a', status: 'planned' },
      { id: 'b', status: 'planned' },
    ])
    const allSkipped = computeRoadmapProgress(stages, {
      a: entry('skipped'),
      b: entry('skipped'),
    })

    expect(allSkipped.total).toBe(2)
    expect(allSkipped.skipped).toBe(2)
    expect(allSkipped.percent).toBe(0)
  })
})

describe('findNextCourse', () => {
  it('按声明顺序返回第一个未完成、未跳过的节点', () => {
    const stages = stagesWith([
      { id: 'a', status: 'completed' },
      { id: 'b', status: 'skipped' },
      { id: 'c', status: 'in-progress' },
      { id: 'd', status: 'planned' },
    ])

    expect(findNextCourse(stages)?.id).toBe('c')
    // 用户把 c 标完后，下一步跳过 b（skipped 永不推荐），指向 d
    expect(findNextCourse(stages, { c: entry('completed') })?.id).toBe('d')
  })

  it('全部完成/跳过时返回 null', () => {
    const stages = stagesWith([
      { id: 'a', status: 'completed' },
      { id: 'b', status: 'planned' },
    ])

    expect(findNextCourse(stages, { b: entry('skipped') })).toBeNull()
  })
})

describe('路线数据完整性（发布契约）', () => {
  it('18 个节点、id 全局唯一且非空', () => {
    expect(ROADMAP_COURSE_IDS).toHaveLength(18)
    expect(new Set(ROADMAP_COURSE_IDS).size).toBe(ROADMAP_COURSE_IDS.length)
    expect(ROADMAP_COURSE_IDS.every(id => id.length > 0)).toBe(true)
  })

  it('id 都是稳定 slug：小写字母/数字/连字符', () => {
    for (const id of ROADMAP_COURSE_IDS) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('isKnownCourseId / findCourseById 对未知 id 的行为一致', () => {
    expect(isKnownCourseId('react-basics')).toBe(true)
    expect(findCourseById('react-basics')?.id).toBe('react-basics')
    expect(isKnownCourseId('no-such')).toBe(false)
    expect(findCourseById('no-such')).toBeNull()
  })

  it('前置依赖 id 必须真实存在（防路线图自引用悬空）', () => {
    for (const stage of ROADMAP_STAGES) {
      for (const sem of stage.semesters) {
        for (const course of sem.courses) {
          for (const prereq of course.prerequisites ?? []) {
            expect(isKnownCourseId(prereq)).toBe(true)
          }
        }
      }
    }
  })
})
