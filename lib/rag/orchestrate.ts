import { streamText } from 'ai'
import { logger } from '@/lib/logger'
import { searchSimilar, type SimilarChunk } from './store'
import { AI_MODEL, embedQueryRemote, getChatModel, isRerankConfigured } from './remote'

/** SPEC §8.5：检索片段总长截断（v2.0 为 6000 字符）。 */
export const CONTEXT_MAX_CHARS = 6000

/**
 * SPEC §8.5 拒答指令：**无条件注入**（检索为空也不短路返回，照常调模型）。
 * 资料里没有的内容必须说「资料中没有提到」，绝不编造来源。
 */
export const REFUSAL_INSTRUCTION =
  '只能依据下面给出的资料作答。资料里没有的内容，直接说明「资料中没有提到」，绝不猜测或编造。回答如引用资料，必须给出确实看到的来源路径。'

export interface RetrieveResult {
  answer: string
  sources: SimilarChunk[]
  /** 检索/重排不可用 → true（§6.4 降级，不抛错）。 */
  degraded: boolean
  degradedReason?: 'embedding-unavailable' | 'rerank-skipped' | 'llm-unavailable'
  retrieved: number
  model: string | null
}

export interface RetrieveOptions {
  topK?: number
  model?: string
}

/** 把检索到的片段拼成上下文块，超出 maxChars 整体截断。 */
export function buildContextBlock(sources: SimilarChunk[], maxChars = CONTEXT_MAX_CHARS): string {
  if (sources.length === 0) return ''
  const block = sources
    .map(
      (source, index) =>
        `[${index + 1}] 来源：${source.slug}#${source.chunkIndex}（${source.title}）\n${source.content}`,
    )
    .join('\n\n')
  return block.length > maxChars ? block.slice(0, maxChars) : block
}

/** 系统提示：拒答指令无条件注入 + 上下文块（可为空）。 */
export function buildSystemPrompt(contextBlock: string): string {
  const context = contextBlock.trim()
  return [
    REFUSAL_INSTRUCTION,
    '',
    context ? `资料如下：\n\n${context}` : '本次没有检索到任何资料。',
  ].join('\n')
}

interface Prepared {
  sources: SimilarChunk[]
  degraded: boolean
  degradedReason?: RetrieveResult['degradedReason']
  modelName: string | null
  model: ReturnType<typeof getChatModel>
}

/** 检索 + 提示构建（不生成）。 */
async function prepare(query: string, options: RetrieveOptions): Promise<Prepared> {
  const topK = options.topK ?? 8
  const modelName = options.model ?? AI_MODEL ?? null

  const queryEmbedding = await embedQueryRemote(query)
  let degraded = false
  let degradedReason: RetrieveResult['degradedReason']

  let sources: SimilarChunk[] = []
  if (queryEmbedding) {
    sources = await searchSimilar(queryEmbedding, topK)
  } else {
    degraded = true
    degradedReason = 'embedding-unavailable'
    logger.warn({ code: 'RAG_EMBED_UNAVAILABLE' })
  }

  if (!isRerankConfigured()) {
    // 本地 Qwen3-Reranker 禁止进请求路径（D9/D15），托管重排未配置则跳过，按向量分数排序。
    degraded = true
    degradedReason = degradedReason ?? 'rerank-skipped'
  }

  return {
    sources,
    degraded,
    degradedReason,
    modelName,
    model: getChatModel(options.model),
  }
}

/**
 * RAG 编排（T10）：查询向量化 → pgvector top-K →（可选重排）→ LLM 生成。
 * 任何可选能力失效只 warn 并降级（§6.4 / V5），不抛错阻断。
 */
export async function retrieveAndAnswer(
  query: string,
  options: RetrieveOptions = {},
): Promise<RetrieveResult> {
  const prepared = await prepare(query, options)
  if (!prepared.model) {
    logger.warn({ code: 'RAG_LLM_UNAVAILABLE' })
    return {
      answer: '',
      sources: prepared.sources,
      degraded: true,
      degradedReason: 'llm-unavailable',
      retrieved: prepared.sources.length,
      model: prepared.modelName,
    }
  }

  const result = streamText({
    model: prepared.model,
    system: buildSystemPrompt(buildContextBlock(prepared.sources)),
    prompt: query,
  })

  return {
    answer: await result.text,
    sources: prepared.sources,
    degraded: prepared.degraded,
    degradedReason: prepared.degradedReason,
    retrieved: prepared.sources.length,
    model: prepared.modelName,
  }
}

export interface StreamedAnswer extends Omit<RetrieveResult, 'answer'> {
  /** AI SDK 文本流，供 SSE 分块下发。 */
  textStream: AsyncIterable<string>
}

/** 流式版本：供 /api/ai/ask 的 SSE 逐块下发（T11 消费）。 */
export async function retrieveAndAnswerStream(
  query: string,
  options: RetrieveOptions = {},
): Promise<StreamedAnswer> {
  const prepared = await prepare(query, options)
  if (!prepared.model) {
    logger.warn({ code: 'RAG_LLM_UNAVAILABLE' })
    return {
      sources: prepared.sources,
      degraded: true,
      degradedReason: 'llm-unavailable',
      retrieved: prepared.sources.length,
      model: prepared.modelName,
      textStream: (async function* empty() {
        /* 无模型可调用：空流，由调用方给出 not-configured 语义 */
      })(),
    }
  }

  const result = streamText({
    model: prepared.model,
    system: buildSystemPrompt(buildContextBlock(prepared.sources)),
    prompt: query,
  })

  return {
    sources: prepared.sources,
    degraded: prepared.degraded,
    degradedReason: prepared.degradedReason,
    retrieved: prepared.sources.length,
    model: prepared.modelName,
    textStream: result.textStream,
  }
}
