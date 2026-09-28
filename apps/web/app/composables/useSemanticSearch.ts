import type {
  SearchUnavailableReason,
  SemanticPostResult,
  SemanticSearchResponse,
  SearchStatus,
} from '@studyplan/shared'

/** 防抖等待。400ms 与 roadmap 页同款手感：比回车搜索随意，比即输即查克制 */
const DEBOUNCE_MS = 400

/**
 * 语义搜索的组合式入口：输入驱动，debounce 自动查。
 * 服务端错误不弹全局提示 —— 搜索框还在、只是没结果，
 * 与 posts 列表页的错误处理策略一致。
 */
export function useSemanticSearch() {
  const api = useApi()
  const route = useRoute()

  const query = ref<string>(typeof route.query.q === 'string' ? route.query.q : '')
  const results = ref<SemanticPostResult[]>([])
  const pending = ref(false)
  const reason = ref<SearchUnavailableReason | null>(null)
  const status = ref<SearchStatus | null>(null)

  // 状态拉取失败不拦页面：status 为 null 时只是少一条空态文案
  api
    .get<SearchStatus>('/search/status')
    .then((res) => {
      status.value = res
    })
    .catch(() => undefined)

  let timer: ReturnType<typeof setTimeout> | undefined
  let latestToken = 0

  async function run(value: string): Promise<void> {
    const text = value.trim()
    if (!text) {
      results.value = []
      reason.value = null
      return
    }
    pending.value = true
    // 竞态防护：慢请求后到时用序号判断它还是不是最新一次，不是就丢弃。
    // 否则用户删字删到一半，旧结果会盖回来。
    const token = ++latestToken
    try {
      const res = await api.post<SemanticSearchResponse>('/search/semantic', { query: text })
      if (token !== latestToken) return
      results.value = res.results
      reason.value = res.reason
    } catch {
      if (token !== latestToken) return
      results.value = []
      reason.value = 'error'
    } finally {
      if (token === latestToken) pending.value = false
    }
  }

  watch(query, (value) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void run(value), DEBOUNCE_MS)
  })

  // ?q= 直达：进页面就替用户查一次（分享链接的预期）
  if (query.value.trim()) void run(query.value)

  return { query, results, pending, reason, status }
}
