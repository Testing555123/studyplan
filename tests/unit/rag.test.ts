import { beforeEach, describe, expect, it, vi } from 'vitest'

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { execute, insert: vi.fn(), transaction: vi.fn() } }))

const { embedQueryRemote, getChatModel, isRerankConfigured } = vi.hoisted(() => ({
  embedQueryRemote: vi.fn(),
  getChatModel: vi.fn(),
  isRerankConfigured: vi.fn(),
}))
vi.mock('@/lib/rag/remote', () => ({
  AI_MODEL: 'qwen/test-model',
  embedQueryRemote,
  getChatModel,
  isRerankConfigured,
  isAiConfigured: () => true,
}))

const { streamText } = vi.hoisted(() => ({ streamText: vi.fn() }))
vi.mock('ai', () => ({ streamText }))

const { buildContextBlock, buildSystemPrompt, retrieveAndAnswer, CONTEXT_MAX_CHARS } = await import(
  '@/lib/rag/orchestrate'
)
const { searchSimilar } = await import('@/lib/rag/store')

const VECTOR = Array.from({ length: 1024 }, (_, i) => i / 1024)

describe('RAG 上下文与拒答提示（T10 / SPEC §8.5）', () => {
  it('检索为空时系统提示仍无条件注入拒答指令', () => {
    const prompt = buildSystemPrompt('')
    expect(prompt).toContain('绝不猜测或编造')
    expect(prompt).toContain('没有检索到任何资料')
  })

  it('上下文块按 6000 字符截断', () => {
    const sources = Array.from({ length: 6 }, (_, i) => ({
      slug: `design/0${i}`,
      title: '设计',
      chunkIndex: i,
      content: 'A'.repeat(2000),
      score: 0.9,
    }))
    const block = buildContextBlock(sources)
    expect(block.length).toBe(CONTEXT_MAX_CHARS)
  })

  it('上下文为空块返回空字符串', () => {
    expect(buildContextBlock([])).toBe('')
  })
})

describe('searchSimilar（T10）', () => {
  beforeEach(() => execute.mockReset())

  it('命中时映射为 camelCase 并带相似度', async () => {
    execute.mockResolvedValue({
      rows: [
        {
          slug: 'design/01',
          title: '视觉风格',
          chunk_index: 0,
          content: '正文',
          score: 0.87,
        },
      ],
    })
    const hits = await searchSimilar(VECTOR, 5)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ slug: 'design/01', chunkIndex: 0, score: 0.87 })
  })

  it('维度不符直接返回空（不查库）', async () => {
    const hits = await searchSimilar([0.1, 0.2], 5)
    expect(hits).toEqual([])
    expect(execute).not.toHaveBeenCalled()
  })
})

describe('retrieveAndAnswer（T10 / 降级与拒答）', () => {
  beforeEach(() => {
    execute.mockReset()
    embedQueryRemote.mockReset()
    getChatModel.mockReset()
    isRerankConfigured.mockReset()
    streamText.mockReset()
  })

  it('检索到资料时返回答案与来源', async () => {
    embedQueryRemote.mockResolvedValue(VECTOR)
    isRerankConfigured.mockReturnValue(true)
    getChatModel.mockReturnValue({ id: 'fake' })
    streamText.mockReturnValue({ text: Promise.resolve('依据 [1] 资料，答案是 X。') })
    execute.mockResolvedValue({
      rows: [{ slug: 'design/01', title: '视觉风格', chunk_index: 0, content: '正文', score: 0.9 }],
    })

    const result = await retrieveAndAnswer('视觉风格是什么？')
    expect(result.answer).toContain('答案是 X')
    expect(result.retrieved).toBe(1)
    expect(result.sources[0].slug).toBe('design/01')
    expect(result.degraded).toBe(false)
  })

  it('嵌入不可用时降级：来源为空但仍调模型，不抛错', async () => {
    embedQueryRemote.mockResolvedValue(null)
    isRerankConfigured.mockReturnValue(false)
    getChatModel.mockReturnValue({ id: 'fake' })
    streamText.mockReturnValue({ text: Promise.resolve('资料中没有提到。') })

    const result = await retrieveAndAnswer('随便问点什么')
    expect(result.sources).toEqual([])
    expect(result.degraded).toBe(true)
    expect(result.degradedReason).toBe('embedding-unavailable')
    expect(result.answer).toBe('资料中没有提到。')
  })

  it('LLM 不可用时返回空答案并标注原因', async () => {
    embedQueryRemote.mockResolvedValue(VECTOR)
    isRerankConfigured.mockReturnValue(false)
    getChatModel.mockReturnValue(null)
    execute.mockResolvedValue({ rows: [] })

    const result = await retrieveAndAnswer('问什么')
    expect(result.answer).toBe('')
    expect(result.degradedReason).toBe('llm-unavailable')
  })
})
