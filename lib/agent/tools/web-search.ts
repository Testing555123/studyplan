import { z } from 'zod'
import { tool } from '@langchain/core/tools'

/**
 * webSearch（T13）：**现成** tool —— 直接用 @langchain/tavily 的 TavilySearch。
 *
 * 仅用于 SPEC §6.4 的兜底（本地检索不可用 → LLM + 网络搜索），
 * 未配置 TAVILY_API_KEY 时不注册该 tool（V5：未配 Key 不阻断，能力静默缺失）。
 * 注意：网络搜索会把查询发往外部，仅在本地检索不可用且已显式配置时启用。
 */
export interface AgentToolLike {
  name: string
}

export async function createWebSearchTool(): Promise<AgentToolLike | null> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) return null

  const { TavilySearch } = await import('@langchain/tavily')
  const retriever = new TavilySearch({
    apiKey,
    maxResults: 5,
  } as ConstructorParameters<typeof TavilySearch>[0])

  return tool(
    async ({ query }) => {
      // TavilySearch 是 retriever：入参为其结构化输入对象（query 为必填字段）。
      const docs = await retriever.invoke({ query })
      return JSON.stringify(
        docs.map((doc: { pageContent: string; metadata?: Record<string, unknown> }) => ({
          content: doc.pageContent.slice(0, 800),
          url: doc.metadata?.source ?? null,
        })),
      )
    },
    {
      name: 'webSearch',
      description: '联网搜索兜底：本地电子书检索无结果时使用，返回网页摘要与链接。',
      schema: z.object({ query: z.string().min(1).describe('搜索关键词') }),
    },
  ) as unknown as AgentToolLike
}
