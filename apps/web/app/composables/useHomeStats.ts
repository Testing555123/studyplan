/**
 * 首页 Bento 卡片的真实数据来源。
 *
 * ── 为什么用 useAsyncData 而不是自己写 ref + onMounted ──
 *   1. SSR 友好：Nuxt 会在服务端渲染前把这批数据等齐，首屏 HTML 里就带着
 *      真实数字，而不是先出一屏骨架再跳变 —— 后者正是"完成度低"的典型观感；
 *   2. 状态现成：`status` / `error` / `refresh` 直接对应
 *      「载入中 / 出错 / 重试」三种状态，不必每个页面各发明一套；
 *   3. 去重：同一个 key 的多处调用共享一份请求与缓存。
 *
 * ⚠️ 帖子只取 1 条（pageSize=1）：这里只需要 `total` 计数，
 *    拉取整页正文纯属浪费。
 */
import type { GithubRepo, PostListResponse, TrendingResponse } from '@studyplan/shared'

export function useHomeStats() {
  const api = useApi()
  const { percent, completed, total: nodeTotal } = useRoadmapProgress()

  const { data, status, error, refresh } = useAsyncData('home-stats', async () => {
    const [posts, trending] = await Promise.all([
      api.get<PostListResponse>('/posts', { page: 1, pageSize: 1 }),
      api.get<TrendingResponse>('/github/trending', { range: '7d' }),
    ])

    return {
      postCount: posts.total,
      repoCount: trending.total,
      repos: trending.items.slice(0, 3),
    }
  })

  return {
    /** 首次载入中（用于骨架） */
    pending: computed(() => status.value === 'pending'),
    /** 取数失败（用于错误态与重试按钮） */
    error,
    /** 重新拉取 */
    refresh,
    postCount: computed(() => data.value?.postCount ?? null),
    repoCount: computed(() => data.value?.repoCount ?? null),
    repos: computed<GithubRepo[]>(() => data.value?.repos ?? []),
    /** 路线进度（来自共享包，不依赖网络） */
    percent,
    completed,
    nodeTotal,
  }
}
