import { z } from 'zod'
import { tool } from '@langchain/core/tools'
import { searchSimilar } from '@/lib/rag/store'
import { embedQueryRemote } from '@/lib/rag/remote'

/**
 * searchEbook（T13）：把本地 pgvector 电子书检索包装成 LangChain tool。
 *
 * 这是唯一必须自研的 tool —— 数据在自有 PG（不出网），没有现成 tool 能查；
 * 循环编排与调度交给 LangGraph，这里只做薄封装。
 * 查询向量化走托管端点（D9/D15：请求路径禁止加载本地 300MB 模型），
 * 不可用时返回明确提示，由模型按 §8.5 拒答，而不是报错中断。
 */
export const searchEbook = tool(
  async ({ query, topK }) => {
    const embedding = await embedQueryRemote(query)
    if (!embedding) {
      return JSON.stringify({
        unavailable: true,
        message: '本地向量检索暂不可用（未配置托管嵌入端点），请据已有知识说明无法检索。',
      })
    }
    const hits = await searchSimilar(embedding, topK)
    return JSON.stringify(
      hits.map((hit) => ({
        slug: hit.slug,
        title: hit.title,
        chunkIndex: hit.chunkIndex,
        score: Number(hit.score.toFixed(4)),
        content: hit.content.slice(0, 800),
      })),
    )
  },
  {
    name: 'searchEbook',
    description: '在本地电子书语料中做语义检索，返回与问题相关的片段及来源路径（slug）。',
    schema: z.object({
      query: z.string().min(1).describe('检索用的自然语言查询'),
      topK: z.number().int().min(1).max(20).default(5).describe('返回片段数量'),
    }),
  },
)
