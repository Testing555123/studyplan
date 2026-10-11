import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// embed 标注走 remote/store，全部打桩；本文件核心是模板导读的确定性。
const embedMock = vi.hoisted(() => vi.fn())
const searchMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/rag/remote', () => ({
  embedQueryRemote: (...args: unknown[]) => embedMock(...args),
}))

vi.mock('@/lib/rag/store', () => ({
  searchSimilar: (...args: unknown[]) => searchMock(...args),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

const { buildDigestFromSnapshot, annotateStages } = await import('@/lib/digest/build')
const { __resetTrendingSingleFlight } = await import('@/lib/github/trending')

const repos = [
  { fullName: 'a/one', htmlUrl: 'https://x/1', description: 'first', language: 'TypeScript', stargazersCount: 2100, forksCount: 100 },
  { fullName: 'b/two', htmlUrl: 'https://x/2', description: 'second', language: 'TypeScript', stargazersCount: 900, forksCount: 80 },
  { fullName: 'c/three', htmlUrl: 'https://x/3', description: null, language: 'Rust', stargazersCount: 500, forksCount: 60 },
  { fullName: 'd/four', htmlUrl: 'https://x/4', description: 'fourth', language: null, stargazersCount: 120, forksCount: 10 },
]

beforeEach(() => {
  embedMock.mockReset()
  searchMock.mockReset()
  __resetTrendingSingleFlight()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('buildDigestFromSnapshot（确定性模板导读）', () => {
  it('空快照 → count 0 空导读', () => {
    const digest = buildDigestFromSnapshot([])
    expect(digest.count).toBe(0)
    expect(digest.text).toBe('今日暂无新收录项目。')
    expect(digest.top).toEqual([])
    expect(digest.starRange).toEqual({ min: 0, max: 0 })
  })

  it('统计收录数/语言分布/Top3/star 区间，同输入必同输出', () => {
    const a = buildDigestFromSnapshot(repos)
    const b = buildDigestFromSnapshot(repos)
    expect(a).toEqual(b)
    expect(a.count).toBe(4)
    expect(a.languages[0]).toEqual({ language: 'TypeScript', count: 2 })
    expect(a.top.map((t) => t.fullName)).toEqual(['a/one', 'b/two', 'c/three'])
    expect(a.starRange).toEqual({ min: 120, max: 2100 })
    expect(a.text).toContain('今日新收录 4 个项目')
    expect(a.text).toContain('TypeScript 占 50%')
    expect(a.text).toContain('2.1k★')
  })
})

describe('annotateStages（embed 相似度标注，可选降级）', () => {
  it('embed 命中 stages/ 前缀 → 写入相关阶段 slug/title', async () => {
    embedMock.mockResolvedValue([0.1, 0.2])
    searchMock.mockResolvedValue([
      { slug: 'stages/stage-3', title: '阶段 3 · 后端', chunkIndex: 0, content: 'x', score: 0.61 },
    ])
    const result = await annotateStages(repos)
    expect(result[0]).toMatchObject({ relatedStageSlug: 'stages/stage-3', relatedStageTitle: '阶段 3 · 后端' })
  })

  it('未配置 AI（embed 返回 null）→ 整体原样返回', async () => {
    embedMock.mockResolvedValue(null)
    const result = await annotateStages(repos)
    expect(result).toEqual(repos)
    expect(searchMock).not.toHaveBeenCalled()
  })

  it('top-1 非 stages/ 前缀（如 guide/）→ 不标注', async () => {
    embedMock.mockResolvedValue([0.1, 0.2])
    searchMock.mockResolvedValue([
      { slug: 'guide/roadmap', title: '路线', chunkIndex: 0, content: 'x', score: 0.5 },
    ])
    const result = await annotateStages(repos)
    expect(result[0].relatedStageSlug).toBeUndefined()
  })

  it('单条 embed 抛错 → 跳过该仓库继续其余（不阻断）', async () => {
    embedMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValue([0.3, 0.4])
    searchMock.mockResolvedValue([
      { slug: 'stages/stage-1', title: '阶段 1', chunkIndex: 0, content: 'x', score: 0.7 },
    ])
    const result = await annotateStages(repos)
    expect(result[0].relatedStageSlug).toBeUndefined()
    expect(result[1].relatedStageSlug).toBe('stages/stage-1')
  })

  it('空快照直接返回，不发请求', async () => {
    const result = await annotateStages([])
    expect(result).toEqual([])
    expect(embedMock).not.toHaveBeenCalled()
  })
})
