import { beforeEach, describe, expect, it, vi } from 'vitest'

// 检索质量闸门 + 段落编排（本批功能）：闸门为纯函数，直接测；buildSystemPrompt 沿用 §8.5 断言。
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
vi.mock('@/lib/db', () => ({ db: { execute: vi.fn(), insert: vi.fn(), transaction: vi.fn() } }))

const {
  assessRetrieval,
  buildSystemPrompt,
  retrieveAndAnswerStream,
  prepareRag,
  RAG_FALLBACK_SCORE,
} = await import('@/lib/rag/orchestrate')

const { db } = await import('@/lib/db')
const execute = (db as unknown as { execute: ReturnType<typeof vi.fn> }).execute

const VECTOR = Array.from({ length: 1024 }, (_, i) => i / 1024)
const chunk = (score: number) => ({
  slug: 'stages/stage-1',
  title: '阶段 1',
  chunkIndex: 0,
  content: '正文',
  score,
})

beforeEach(() => {
  embedQueryRemote.mockReset()
  getChatModel.mockReset()
  isRerankConfigured.mockReset()
  streamText.mockReset()
  execute.mockReset()
})

describe('assessRetrieval（检索质量闸门，纯函数）', () => {
  it('空结果 → 不足', () => {
    expect(assessRetrieval([])).toEqual({ sufficient: false, topScore: null })
  })

  it('top1 达阈值 → 充分；低于阈值 → 不足', () => {
    expect(assessRetrieval([chunk(0.8)]).sufficient).toBe(true)
    expect(assessRetrieval([chunk(0.2)]).sufficient).toBe(false)
    expect(assessRetrieval([chunk(0.35)], 0.35).sufficient).toBe(true)
  })

  it('默认阈值来自 env RAG_FALLBACK_SCORE（缺省 0.35）', () => {
    expect(RAG_FALLBACK_SCORE).toBeGreaterThan(0)
    expect(RAG_FALLBACK_SCORE).toBeLessThan(1)
  })
})

describe('buildSystemPrompt（段落编排 + 拒答指令共存）', () => {
  it('同时包含拒答指令与编排要求，且保留 §8.5 断言文本', () => {
    const prompt = buildSystemPrompt('')
    expect(prompt).toContain('绝不猜测或编造')
    expect(prompt).toContain('没有检索到任何资料')
    expect(prompt).toContain('结论先行')
    expect(prompt).toContain('[1]')
    expect(prompt).toContain('来源')
  })
})

describe('chat 闸门链路（prepareRag + 流式复用）', () => {
  it('检索充分：prepareRag 的结果传入流式版本，检索只执行一次', async () => {
    embedQueryRemote.mockResolvedValue(VECTOR)
    isRerankConfigured.mockReturnValue(true)
    getChatModel.mockReturnValue({ id: 'fake' })
    execute.mockResolvedValue({
      rows: [{ slug: 'stages/stage-1', title: '阶段 1', chunk_index: 0, content: '正文', score: 0.9 }],
    })
    streamText.mockReturnValue({ textStream: (async function* () { yield '答案 [1]' })() })

    const prepared = await prepareRag('视觉风格')
    const gate = assessRetrieval(prepared.sources)
    expect(gate.sufficient).toBe(true)

    const result = await retrieveAndAnswerStream('视觉风格', {}, prepared)
    let text = ''
    for await (const t of result.textStream) text += t
    expect(text).toContain('答案')
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('检索不足：sources 为空时 assessRetrieval 判定兜底', async () => {
    embedQueryRemote.mockResolvedValue(VECTOR)
    isRerankConfigured.mockReturnValue(true)
    getChatModel.mockReturnValue({ id: 'fake' })
    execute.mockResolvedValue({ rows: [] })

    const prepared = await prepareRag('冷门问题')
    expect(assessRetrieval(prepared.sources).sufficient).toBe(false)
  })
})
