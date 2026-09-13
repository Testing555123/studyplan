import { ref } from 'vue'
import type { GithubRepo, RepoIntroBatchResponse } from '@studyplan/shared'

/**
 * 项目简介（AI 润色版）的共享状态。
 *
 * ── 为什么用模块级状态而不是组件内 ref ──
 *
 * 简介要在**榜单卡片**和**详情页**两处显示，而它们是不同的组件。
 * 如果各自持有一份，从列表点进详情时会重新请求一次，
 * 已经生成好的简介等于白拿了一次。
 * 模块级的一份状态，让"进过列表"这件事对详情页也生效。
 *
 * ── 为什么是"触发 + 轮询"两段而不是一次等到底 ──
 *
 * 生成一条简介要真调一次模型，实测 20-40 秒；
 * 而后端一次调用只会做**有限的工作量**（条数上限 + 时间预算），
 * 剩下的要等下一轮。所以这里先 POST 触发，再隔几秒 GET 取一次结果。
 * 这样做的好处是：请求始终在平台的时间限制内，
 * 刷新、中断、并发都不会把已经做好的部分弄丢。
 */

/** 仓库 id → 简介文本 */
const introMap = ref<Record<number, string>>({})

/** 正在等待生成的仓库 id */
const pendingIds = ref<Set<number>>(new Set())

/**
 * 是否已整体降级（AI 未启用或额度耗尽）。
 * 一旦为 true 就不再轮询 —— 再问也是同样的结果。
 */
let degraded = false

/** 是否已有一次流程在跑。防止列表与详情同时触发、重复消耗额度 */
let running = false

/** 轮询间隔与次数上限：3 次 × 3 秒 ≈ 给生成留 9 秒窗口 */
const POLL_INTERVAL_MS = 3000
const POLL_MAX_ROUNDS = 3

export function useRepoIntros() {
  const api = useApi()

  function merge(response: RepoIntroBatchResponse): void {
    for (const item of response.intros) {
      if (item.intro) introMap.value[item.repoId] = item.intro
    }
    pendingIds.value = new Set(response.pending)
    if (response.degraded) degraded = true
  }

  /** 只读取，不触发生成。轮询必须是廉价的 */
  async function poll(ids: number[]): Promise<void> {
    if (ids.length === 0 || degraded) return
    const response = await api.get<RepoIntroBatchResponse>('/github/intros', {
      ids: ids.join(','),
    })
    merge(response)
  }

  /**
   * 为这批仓库取简介，缺失的会顺带触发生成。
   *
   * 整个过程**不抛异常**：简介是增强功能，
   * 拿不到时页面继续显示 GitHub 官方简介，用户看不出差别。
   */
  async function ensure(repos: GithubRepo[]): Promise<void> {
    if (repos.length === 0 || running || degraded) return

    running = true
    try {
      const ids = repos.map((repo) => repo.id)
      // 已经在库里的会立刻返回；这次调用最多再生成后端限额内的几条
      merge(await api.post<RepoIntroBatchResponse>('/github/intros/batch', { repoIds: ids }))

      for (let round = 0; round < POLL_MAX_ROUNDS; round += 1) {
        if (pendingIds.value.size === 0 || degraded) break
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        await poll(ids)
      }
    } catch {
      // 简介是增强功能：失败就保持显示官方简介，不需要用户知道
    } finally {
      running = false
    }
  }

  /** 取某个仓库的润色简介；没有则返回 null，由调用方回退到官方简介 */
  function introFor(repoId: number): string | null {
    return introMap.value[repoId] ?? null
  }

  function isPending(repoId: number): boolean {
    return pendingIds.value.has(repoId)
  }

  return { introMap, pendingIds, ensure, introFor, isPending }
}
