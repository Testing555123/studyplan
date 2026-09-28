/**
 * 学习路线的搜索与筛选。
 *
 * 18 个节点的数据量，客户端过滤就够了 —— 不为此引入后端搜索接口
 * 是刻意的取舍（数据上千条再考虑）。
 *
 * 注意两件事：
 *   1. 匹配范围是"名称 + 标签 + 描述"，不只是名称 ——
 *      用户搜"测试"时期望命中"表单、测试与可访问性"，靠标签才搜得准；
 *   2. 筛选**只影响列表展示，不影响进度分母** ——
 *      筛完剩 2 条不代表进度变成 2/2，聚合永远走全量 + 覆盖层。
 */
import type { Course, CourseStatus, Stage } from '@studyplan/shared'
import { resolveCourseStatus } from '@studyplan/shared'

/** 一条命中结果：节点本身 + 它在路线中的位置 + 用户视角的最终状态 */
export interface CourseHit {
  course: Course
  stageTitle: string
  semesterName: string
  status: CourseStatus
}

/** 状态筛选的"全部"哨兵值（避免用 undefined 和真实状态混淆） */
export type StatusFilter = CourseStatus | 'all'

export function useRoadmapSearch(
  stages: MaybeRefOrGetter<Stage[]>,
  query: MaybeRefOrGetter<string>,
  statusFilter: MaybeRefOrGetter<StatusFilter>,
) {
  const { overrides } = useRoadmapState()

  /** 是否有任一筛选条件生效（决定页面切到"结果列表"还是"时间线"） */
  const isFiltering = computed(() => {
    return toValue(query).trim().length > 0 || toValue(statusFilter) !== 'all'
  })

  const results = computed<CourseHit[]>(() => {
    const q = toValue(query).trim().toLowerCase()
    const status = toValue(statusFilter)

    const hits: CourseHit[] = []
    for (const stage of toValue(stages)) {
      for (const sem of stage.semesters) {
        for (const course of sem.courses) {
          const resolved = resolveCourseStatus(course, overrides.value)

          if (status !== 'all' && resolved !== status) continue

          if (q) {
            const haystack = [course.name, course.description ?? '', ...(course.tags ?? [])]
              .join(' ')
              .toLowerCase()
            if (!haystack.includes(q)) continue
          }

          hits.push({
            course,
            stageTitle: stage.title,
            semesterName: sem.name,
            status: resolved,
          })
        }
      }
    }
    return hits
  })

  return { isFiltering, results }
}
