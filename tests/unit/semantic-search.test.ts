import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 语义搜索：embed/store 打桩，专测编排、LRU 缓存与降级语义。
const embedMock = vi.hoisted(() => vi.fn())
const searchMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/rag/remote', () => ({
  embedQueryRemote: (...args: unknown[]) => embedMock(...args),
}))

vi.mock('@/lib/rag/store', () => ({
  searchSimilar: (...args: unknown[]) => searchMock(...args),
}))

const { semanticSearch, __resetSearchCache, SEARCH_LRU_MAX } = await import('@/lib/search/semantic')

const hit = (slug: string) => ({
  slug,
  title: `标题 ${slug}`,
  chunkIndex: 0,
  content: '这是一段命中的内容，用于面板预览。',
  score: 0.6,
})

beforeEach(() => {
  embedMock.mockReset()
  searchMock.mockReset()
  __resetSearchCache()
  embedMock.mockResolvedValue([0.1, 0.2])
  searchMock.mockResolvedValue([hit('stages/stage-1')])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('semanticSearch（远程 embedding + pgvector 复用）', () => {
  it('返回映射后的 hits（url/snippet 截断）', async () => {
    const hits = await semanticSearch('pgvector 是什么')
    expect(hits[0]).toMatchObject({ slug: 'stages/stage-1', url: '/ebook/stages/stage-1' })
    expect(hits[0].snippet.length).toBeLessThanOrEqual(121) // 120 + 省略号
  })

  it('空/纯空白查询：不发请求直接返回空', async () => {
    expect(await semanticSearch('   ')).toEqual([])
    expect(embedMock).not.toHaveBeenCalled()
  })

  it('未配置 AI（embed null）→ 降级空数组', async () => {
    embedMock.mockResolvedValue(null)
    expect(await semanticSearch('q')).toEqual([])
  })

  it('相同查询命中 LRU：embed 只调一次；大小写与空白归一', async () => {
    await semanticSearch('  What is RAG? ')
    await semanticSearch('what is rag?')
    expect(embedMock).toHaveBeenCalledTimes(1)
    expect(searchMock).toHaveBeenCalledTimes(1)
  })

  it(`LRU 上限 ${SEARCH_LRU_MAX}：最旧条目被淘汰`, async () => {
    for (let i = 0; i < SEARCH_LRU_MAX + 5; i++) {
      searchMock.mockResolvedValueOnce([hit(`slug-${i}`)])
      await semanticSearch(`查询 ${i}`)
    }
    expect(embedMock).toHaveBeenCalledTimes(SEARCH_LRU_MAX + 5)
    // 第 0 条早已淘汰；插入“查询 0”时淘汰的恰是第 5 条 → 两者都需重新 embed。
    await semanticSearch('查询 0')
    expect(embedMock).toHaveBeenCalledTimes(SEARCH_LRU_MAX + 6)
    await semanticSearch('查询 5')
    expect(embedMock).toHaveBeenCalledTimes(SEARCH_LRU_MAX + 7)
    // 最近条目仍在缓存。
    await semanticSearch('查询 104')
    expect(embedMock).toHaveBeenCalledTimes(SEARCH_LRU_MAX + 7)
  })
})
