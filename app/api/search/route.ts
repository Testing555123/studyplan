import { z } from 'zod'
import { withRateLimit } from '@/lib/ratelimit'
import { requestIdFrom, successEnvelope, errorEnvelope } from '@/lib/actions/envelope'
import { semanticSearch } from '@/lib/search/semantic'
import { logger } from '@/lib/logger'

/**
 * GET /api/search?q=（本批功能）：电子书语义搜索。
 * 限流档 SEMANTIC_SEARCH（30/60s，SPEC §8.2 预留）→ zod 入口校验 → SuccessBody 包络。
 * 未配置 AI / 检索失败时返回 hits: []（degraded 语义），不报错。
 */
export const dynamic = 'force-dynamic'

const SearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
})

function clientKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
}

export async function GET(req: Request): Promise<Response> {
  const requestId = requestIdFrom(req)
  const url = new URL(req.url)
  const parsed = SearchQuerySchema.safeParse({ q: url.searchParams.get('q') ?? '' })
  if (!parsed.success) {
    return errorEnvelope(
      { statusCode: 400, code: 'BAD_REQUEST', message: '请求参数有误', details: ['q 必须为 1-200 字符的查询词'] },
      requestId,
    )
  }

  return withRateLimit('SEMANTIC_SEARCH', clientKey(req), async () => {
    try {
      const hits = await semanticSearch(parsed.data.q)
      return successEnvelope(
        { query: parsed.data.q, hits, degraded: hits.length === 0 },
        requestId,
      )
    } catch (error) {
      logger.warn({ code: 'SEARCH_ROUTE_DEGRADED', message: (error as Error).message })
      return successEnvelope({ query: parsed.data.q, hits: [], degraded: true }, requestId)
    }
  })
}
