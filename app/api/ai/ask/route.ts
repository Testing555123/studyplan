import { z } from 'zod'
import { AI_MODEL, isAiConfigured } from '@/lib/rag/remote'
import { retrieveAndAnswerStream } from '@/lib/rag/orchestrate'
import { runAgentLoop } from '@/lib/agent/loop'
import { buildCacheKey, getAnswerCached, putAnswerCache } from '@/lib/ai/cache'
import { consumeQuota } from '@/lib/ai/quota'
import { withRateLimit } from '@/lib/ratelimit'
import { requestIdFrom } from '@/lib/actions/envelope'
import { logger } from '@/lib/logger'

/**
 * POST /api/ai/ask（T11）。SSE 流式返回（`text/event-stream`）。
 *
 * 顺序（SPEC §8.3/§8.4）：限流(429) → 未配 Key(200 + not-configured) → 缓存命中(不扣额度)
 * → 扣额度(402 与 429 严格区分) → 检索/生成 → 回写缓存。
 *
 * 事件：`meta`（cached/model/degraded）→ `delta`（文本块）→ `done`（来源）→ 出错时 `error`。
 */
export const dynamic = 'force-dynamic'

const AskBodySchema = z
  .object({
    question: z.string().min(1).max(2000),
    /** chat = 单轮 RAG 问答；agent = 交给 T13 的 LangGraph ReAct loop。 */
    mode: z.enum(['chat', 'agent']).default('chat'),
    contextName: z.string().max(200).default('ebook'),
  })
  .strict()

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function clientKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
}

async function handle(req: Request): Promise<Response> {
  const requestId = requestIdFrom(req)
  const parsed = AskBodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return new Response(
      sse('error', { code: 'BAD_REQUEST', message: '请求体不合法', requestId }),
      { status: 400, headers: { 'Content-Type': 'text/event-stream', 'X-Request-Id': requestId } },
    )
  }

  const { question, mode, contextName } = parsed.data
  const model = AI_MODEL || 'unconfigured'

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(sse(event, data)))

      try {
        if (!isAiConfigured()) {
          send('meta', { enabled: false, reason: 'not-configured', requestId })
          send('error', { code: 'NOT_CONFIGURED', message: '未配置 AI 服务', requestId })
          controller.close()
          return
        }

        const cacheKey = buildCacheKey(question, contextName, model)
        const cached = await getAnswerCached(cacheKey)
        if (cached) {
          // 命中缓存不消耗当日额度（§8.3）。
          send('meta', { cached: true, model, sources: cached.sources, requestId })
          send('delta', { text: cached.answer })
          send('done', { sources: cached.sources, cached: true, degraded: false })
          controller.close()
          return
        }

        const quota = await consumeQuota()
        if (!quota.allowed) {
          send('error', {
            code: 'QUOTA_EXCEEDED',
            message: `今日额度已用尽（${quota.limit}/${quota.limit}），明天再试`,
            requestId,
          })
          controller.close()
          return
        }

        if (mode === 'agent') {
          // T13：LangGraph ReAct loop（tool 调用轨迹一并返回，便于 UI 展示步骤）。
          const agentResult = await runAgentLoop({ question })
          send('meta', {
            cached: false,
            mode: 'agent',
            model,
            degraded: agentResult.degraded,
            reason: agentResult.reason,
            toolsUsed: agentResult.toolsUsed,
            remainingToday: quota.remaining,
            requestId,
          })
          send('delta', { text: agentResult.answer })
          send('done', {
            sources: [],
            steps: agentResult.steps,
            cached: false,
            degraded: agentResult.degraded,
          })
          controller.close()
          return
        }

        const result = await retrieveAndAnswerStream(question)
        send('meta', {
          cached: false,
          model: result.model,
          degraded: result.degraded,
          degradedReason: result.degradedReason,
          retrieved: result.retrieved,
          remainingToday: quota.remaining,
          requestId,
        })

        let answer = ''
        for await (const chunk of result.textStream) {
          if (!chunk) continue
          answer += chunk
          send('delta', { text: chunk })
        }

        const sources = result.sources.map((source) => ({
          slug: source.slug,
          title: source.title,
          chunkIndex: source.chunkIndex,
        }))
        send('done', { sources, cached: false, degraded: result.degraded })

        if (answer) {
          await putAnswerCache({ key: cacheKey, model, question, answer, sources })
        }
        controller.close()
      } catch (error) {
        logger.error({ code: 'AI_ASK_FAILED', message: (error as Error).message, requestId })
        send('error', { code: 'INTERNAL', message: 'AI 问答失败', requestId })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Request-Id': requestId,
      // mode=agent 的分派由 T13 接入后在此消费；当前 agent 与 chat 共用同一检索编排。
      'X-Ai-Mode': mode,
    },
  })
}

export async function POST(req: Request) {
  return withRateLimit('AI_ASK', clientKey(req), () => handle(req))
}
