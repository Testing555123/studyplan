import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 缓存读写走 PG 失败也要保证答案可用（§6.4），这里让 DB 抛错，专测进程内 LRU 语义。
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      throw new Error('db down')
    }),
    insert: vi.fn(() => {
      throw new Error('db down')
    }),
    delete: vi.fn(() => {
      throw new Error('db down')
    }),
  },
}))

const {
  buildCacheKey,
  getAnswerCached,
  putAnswerCache,
  __resetAnswerCacheLru,
} = await import('@/lib/ai/cache')

describe('AI 答案缓存键（T11 / SPEC §8.3）', () => {
  it('键含模型名：换模型必换键（v2.0 缺陷修正）', () => {
    const a = buildCacheKey('什么是 pgvector？', 'ebook', 'model-a')
    const b = buildCacheKey('什么是 pgvector？', 'ebook', 'model-b')
    expect(a).not.toBe(b)
  })

  it('同问题同模型同上下文 → 同键，且大小写与空白归一', () => {
    const a = buildCacheKey('  What is RAG? ', 'ebook', 'model-a')
    const b = buildCacheKey('what is rag?', 'ebook', 'model-a')
    expect(a).toBe(b)
    expect(a).toHaveLength(32)
  })

  it('上下文不同 → 键不同', () => {
    expect(buildCacheKey('q', 'ebook', 'm')).not.toBe(buildCacheKey('q', 'docs', 'm'))
  })
})

describe('AI 缓存 TTL（读路径判定，禁定时清理）', () => {
  beforeEach(() => {
    __resetAnswerCacheLru()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    __resetAnswerCacheLru()
  })

  it('7 天内命中，第 8 天未命中', async () => {
    const key = buildCacheKey('问题', 'ebook', 'model-a')
    await putAnswerCache({ key, model: 'model-a', question: '问题', answer: '答案', sources: [] })

    vi.setSystemTime(new Date('2026-10-16T00:00:00Z')) // 第 6 天
    expect(await getAnswerCached(key)).not.toBeNull()

    vi.setSystemTime(new Date('2026-10-18T00:00:00Z')) // 第 8 天
    expect(await getAnswerCached(key)).toBeNull()
  })

  it('跨模型不命中旧缓存', async () => {
    await putAnswerCache({
      key: buildCacheKey('问题', 'ebook', 'model-a'),
      model: 'model-a',
      question: '问题',
      answer: 'A 模型的答案',
      sources: [],
    })

    const otherKey = buildCacheKey('问题', 'ebook', 'model-b')
    expect(await getAnswerCached(otherKey)).toBeNull()
  })
})
