import type {
  AskPostsUnavailableReason,
  AskSearchResponse,
  AskSource,
} from '@studyplan/shared'

/**
 * 「问全书」的调用入口。
 * 与语义搜索不同：这是显式提交（回车/点按钮），不做 debounce 自动查 ——
 * 每次提问都消耗真实额度，"输入即发送"在这里是反模式。
 */
export function useAskSearch() {
  const api = useApi()

  const question = ref('')
  const answer = ref<string | null>(null)
  const sources = ref<AskSource[]>([])
  const reason = ref<AskPostsUnavailableReason | null>(null)
  const pending = ref(false)
  const cached = ref(false)
  const remainingToday = ref<number | null>(null)

  async function ask(): Promise<void> {
    const text = question.value.trim()
    if (!text || pending.value) return

    pending.value = true
    reason.value = null
    answer.value = null
    sources.value = []
    try {
      const res = await api.post<AskSearchResponse>('/search/ask', { question: text })
      answer.value = res.answer
      sources.value = res.sources
      reason.value = res.reason
      cached.value = res.cached
      remainingToday.value = res.remainingToday
    } catch {
      reason.value = 'error'
    } finally {
      pending.value = false
    }
  }

  function reset(): void {
    question.value = ''
    answer.value = null
    sources.value = []
    reason.value = null
  }

  return { question, answer, sources, reason, pending, cached, remainingToday, ask, reset }
}
