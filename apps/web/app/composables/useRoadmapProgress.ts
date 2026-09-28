/**
 * 学习路线进度的统一入口。
 *
 * ── 为什么需要这个 composable ──
 *
 * 进度此前有两份实现：路线页自己算，侧栏写死 "42%"。
 * 现在两者都改走 `computeRoadmapProgress`（来自 @studyplan/shared），
 * 而这个 composable 负责把它包成响应式的，供任意组件直接取用。
 *
 * ── “我的进度”从哪里来 ──
 *
 * 聚合时会带上 `useRoadmapState` 的个人覆盖层：
 * 用户标记过的节点按自己的状态算，没标记过的节点回退官方默认。
 * 覆盖层是 useState 全局单例，所以路线页与侧栏**不可能算出两个数**。
 *
 * 用法：
 *   const { percent, completed, total } = useRoadmapProgress()
 *
 * @param stages 可选。传入则按该路线计算；不传则用共享的 ROADMAP_STAGES。
 */
import { ROADMAP_STAGES, computeRoadmapProgress } from '@studyplan/shared'
import type { Stage } from '@studyplan/shared'

export function useRoadmapProgress(stages?: MaybeRefOrGetter<Stage[]>) {
  const { overrides } = useRoadmapState()

  const resolved = computed<Stage[]>(() => {
    if (stages == null) return ROADMAP_STAGES
    return toValue(stages) ?? ROADMAP_STAGES
  })

  const progress = computed(() => computeRoadmapProgress(resolved.value, overrides.value))

  return {
    /** 完成百分比（0–100） */
    percent: computed(() => progress.value.percent),
    /** 已完成节点数 */
    completed: computed(() => progress.value.completed),
    /** 进行中节点数 */
    inProgress: computed(() => progress.value.inProgress),
    /** 节点总数 */
    total: computed(() => progress.value.total),
    /** 未开始节点数 */
    planned: computed(() => progress.value.planned),
    /** 原始进度对象 */
    progress,
  }
}
