import { createHash } from 'node:crypto'
import { embedQueryRemote } from '@/lib/rag/remote'
import { searchSimilar } from '@/lib/rag/store'

/**
 * 电子书语义搜索（本批功能）：复用现有 RAG 设施（远程 embedding + pgvector top-K）。
 * - 任一环节不可用/失败 → 返回空数组并降级（§6.4），绝不抛错阻断。
 * - 查询短缓存：进程内 LRU（键 = query hash，上限 100），重复查询不重复计费。
 */

export const SEARCH_LRU_MAX = 100

export interface SearchHit {
  slug: string
  title: string
  /** /ebook/<slug> 可直接跳转。 */
  url: string
  score: number
  /** 命中片段截断（供面板预览）。 */
  snippet: string
}

const cache = new Map<string, SearchHit[]>()

/** 测试辅助：清空查询缓存。 */
export function __resetSearchCache(): void {
  cache.clear()
}

function cacheKey(query: string): string {
  return createHash('sha256').update(query.trim().toLowerCase()).digest('hex').slice(0, 32)
}

function cacheGet(key: string): SearchHit[] | null {
  const hit = cache.get(key)
  if (!hit) return null
  // LRU 触碰：删除后重插，保持最近使用在 Map 尾部。
  cache.delete(key)
  cache.set(key, hit)
  return hit
}

function cachePut(key: string, hits: SearchHit[]): void {
  if (cache.size >= SEARCH_LRU_MAX) {
    // Map 迭代序即插入序，淘汰最旧（头部）。
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, hits)
}

const SNIPPET_MAX_CHARS = 120

/** 语义搜索入口。失败/未配置一律降级为空数组。 */
export async function semanticSearch(query: string, topK = 6): Promise<SearchHit[]> {
  const trimmed = query.trim()
  if (trimmed.length === 0) return []

  const key = cacheKey(trimmed)
  const cached = cacheGet(key)
  if (cached) return cached

  const embedding = await embedQueryRemote(trimmed)
  if (!embedding) {
    // 未配置 AI 或端点失败：静默降级（调用方回退为纯导航命令）。
    return []
  }

  const chunks = await searchSimilar(embedding, topK)
  const hits: SearchHit[] = chunks.map((chunk) => ({
    slug: chunk.slug,
    title: chunk.title,
    url: `/ebook/${chunk.slug}`,
    score: chunk.score,
    snippet: chunk.content.length > SNIPPET_MAX_CHARS ? `${chunk.content.slice(0, SNIPPET_MAX_CHARS)}…` : chunk.content,
  }))
  cachePut(key, hits)
  return hits
}

/** 面板可用性探测：语义分组是否展示（未配置时仅导航命令）。 */
export function isSemanticSearchAvailable(): boolean {
  return Boolean(process.env.AI_EMBED_MODEL) && Boolean(process.env.AI_API_KEY) && Boolean(process.env.AI_BASE_URL)
}
