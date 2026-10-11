import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { logger } from '@/lib/logger'

/**
 * 托管 AI 能力（T10）。
 *
 * 请求路径**绝不加载本地 Qwen3 模型**（D9/D15：本地模型仅后台 job 可用），
 * 因此查询向量化、重排、生成统一走 OpenAI 兼容的托管端点（AI_BASE_URL + AI_API_KEY）。
 * 任一能力不可用只 warn 并返回 null，由 orchestrate 按 SPEC §6.4/V5 降级，绝不抛错阻断。
 *
 * 注意：env 直接读取而非走 @app/shared —— T0 契约已冻结，禁止扩展 shared 的 env schema。
 */
export const AI_API_KEY = process.env.AI_API_KEY ?? ''
export const AI_BASE_URL = process.env.AI_BASE_URL ?? ''
export const AI_MODEL = process.env.AI_MODEL ?? ''
export const AI_EMBED_MODEL = process.env.AI_EMBED_MODEL ?? ''
export const AI_RERANK_MODEL = process.env.AI_RERANK_MODEL ?? ''

/** 是否配置了可用的托管端点（Key 与 baseURL 都有值）。 */
export function isAiConfigured(): boolean {
  return AI_API_KEY.length > 0 && AI_BASE_URL.length > 0
}

/** 未配置时返回 null，调用方据此降级。 */
function provider() {
  if (!isAiConfigured()) return null
  return createOpenAICompatible({
    name: 'studyplan-ai',
    baseURL: AI_BASE_URL,
    apiKey: AI_API_KEY,
  })
}

export async function embedQueryRemote(text: string): Promise<number[] | null> {
  if (!AI_EMBED_MODEL) return null
  const p = provider()
  if (!p) return null
  try {
    const { embedding } = await embedWithProvider(p, text)
    return embedding
  } catch (error) {
    logger.warn({ code: 'AI_EMBED_DEGRADED', message: (error as Error).message })
    return null
  }
}

async function embedWithProvider(
  p: ReturnType<typeof createOpenAICompatible>,
  text: string,
): Promise<{ embedding: number[] }> {
  const model = p.textEmbeddingModel(AI_EMBED_MODEL)
  const { embedding } = await (await import('ai')).embed({ model, value: text })
  return { embedding }
}

/** 生成模型（聊天/问答）。未配置返回 null。 */
export function getChatModel(model?: string) {
  const p = provider()
  if (!p || !AI_MODEL) return null
  return p(model ?? AI_MODEL)
}

/**
 * 托管重排（可选）。未配置 AI_RERANK_MODEL 时返回 null：
 * 本地 Qwen3-Reranker 禁止进请求路径，因此请求期重排只能是「有托管就用，没有就跳过」。
 */
export function isRerankConfigured(): boolean {
  return Boolean(AI_RERANK_MODEL) && isAiConfigured()
}
