import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'
import { logger } from '@/lib/logger'
import { AI_BASE_URL, AI_MODEL, isAiConfigured } from '@/lib/rag/remote'
import { searchEbook } from './tools/ebook'
import { createWebSearchTool } from './tools/web-search'
import { loadMcpTools } from './tools/mcp'

/**
 * Agent loop（T13）—— 现成方案：LangGraph `createReactAgent`（MIT）。
 *
 * 取舍：Mastra 的 @mastra/core 达 72.6MB / 3378 文件（含 hono、ws、posthog-node），
 * 与单容器 output:'standalone' 冲突，故采用 LangGraph（4.4MB）。
 *
 * 领域语义仍留在自研层：拒答原则（§8.5）由 system prompt 注入，
 * 额度与缓存由 T11 在路由层判定，框架只负责 ReAct 循环与 tool 调度。
 */

// @langchain/core 依赖 langsmith：显式关闭遥测，避免任何内容出网（数据不出网约束）。
process.env.LANGCHAIN_TRACING_V2 = process.env.LANGCHAIN_TRACING_V2 ?? 'false'
process.env.LANGCHAIN_CALLBACKS_BACKGROUND =
  process.env.LANGCHAIN_CALLBACKS_BACKGROUND ?? 'false'

/** ReAct 循环上限，防止 tool 调用失控。 */
export const AGENT_RECURSION_LIMIT = 10

export interface AgentInput {
  question: string
  topK?: number
}

export interface AgentResult {
  answer: string
  /** LangGraph 返回的完整消息轨迹（tool 调用步骤可据此展示）。 */
  steps: { role: string; content: string }[]
  toolsUsed: string[]
  degraded: boolean
  reason?: 'not-configured' | 'agent-failed'
}

function buildLlm() {
  if (!isAiConfigured() || !AI_MODEL) return null
  return new ChatOpenAI({
    apiKey: process.env.AI_API_KEY,
    model: AI_MODEL,
    configuration: { baseURL: AI_BASE_URL },
    temperature: 0,
  })
}

/**
 * 默认 tool 集：本地电子书检索（自研薄封装）+ 现成 Tavily 网络搜索（未配 Key 则不注册）
 * + MCP（默认不启用）。
 */
export async function defaultTools() {
  const webSearch = await createWebSearchTool()
  const mcp = await loadMcpTools()
  return [searchEbook, ...(webSearch ? [webSearch] : []), ...mcp]
}

export async function runAgentLoop(
  input: AgentInput,
  tools?: unknown[],
): Promise<AgentResult> {
  const llm = buildLlm()
  if (!llm) {
    return {
      answer: '',
      steps: [],
      toolsUsed: [],
      degraded: true,
      reason: 'not-configured',
    }
  }

  const agentTools = tools ?? (await defaultTools())
  const agent = createReactAgent({
    llm,
    tools: agentTools as never[],
    // §8.5 拒答原则同样约束 agent 路径：资料里没有的必须明说，不得编造。
    prompt:
      '你是 StudyPlan 的检索助手。优先用 searchEbook 检索本地电子书语料作答；' +
      '只能依据检索到的资料作答，资料里没有的内容直接说明「资料中没有提到」，绝不猜测或编造，' +
      '引用时必须给出确实看到的来源路径。',
  })

  try {
    const result = await agent.invoke(
      { messages: [new HumanMessage(input.question)] },
      { recursionLimit: AGENT_RECURSION_LIMIT },
    )

    const messages = (result.messages ?? []) as {
      _getType?: () => string
      content?: unknown
      name?: string
    }[]
    const steps = messages.map((message) => ({
      role: message._getType?.() ?? 'unknown',
      content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content ?? ''),
    }))

    const last = messages[messages.length - 1]
    const answer =
      typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '')

    return {
      answer,
      steps,
      toolsUsed: messages
        .filter((message) => message._getType?.() === 'tool')
        .map((message) => message.name ?? 'tool'),
      degraded: false,
    }
  } catch (error) {
    logger.error({ code: 'AGENT_LOOP_FAILED', message: (error as Error).message })
    return {
      answer: '',
      steps: [],
      toolsUsed: [],
      degraded: true,
      reason: 'agent-failed',
    }
  }
}
