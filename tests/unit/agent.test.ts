import { beforeEach, describe, expect, it, vi } from 'vitest'

const { agentInvoke } = vi.hoisted(() => ({
  agentInvoke: vi.fn(),
}))

vi.mock('@langchain/langgraph/prebuilt', () => ({
  // 现成方案：LangGraph createReactAgent 接管 ReAct 循环（T13）。
  createReactAgent: vi.fn(() => ({ invoke: agentInvoke })),
}))

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    constructor(public options: unknown) {}
    bindTools() {
      return this
    }
    invoke() {
      return Promise.resolve({})
    }
  },
}))

vi.mock('@/lib/rag/remote', () => ({
  AI_BASE_URL: 'https://ai.example.com/v1',
  AI_MODEL: 'test-model',
  isAiConfigured: vi.fn(() => true),
}))

const { runAgentLoop, defaultTools } = await import('@/lib/agent/loop')
const { createWebSearchTool } = await import('@/lib/agent/tools/web-search')
const { loadMcpTools } = await import('@/lib/agent/tools/mcp')

describe('Agent loop（T13 / LangGraph createReactAgent）', () => {
  beforeEach(() => {
    agentInvoke.mockReset()
    delete process.env.TAVILY_API_KEY
    delete process.env.MCP_ENDPOINT
  })

  it('工具调用路径可达：返回答案与步骤轨迹', async () => {
    agentInvoke.mockResolvedValue({
      messages: [
        { _getType: () => 'human', content: '什么是 pgvector？' },
        { _getType: () => 'ai', content: '', name: undefined },
        { _getType: () => 'tool', content: '[{"slug":"design/01"}]', name: 'searchEbook' },
        { _getType: () => 'ai', content: 'pgvector 是 PostgreSQL 的向量扩展。' },
      ],
    })

    const result = await runAgentLoop({ question: '什么是 pgvector？' })
    expect(result.answer).toContain('pgvector')
    expect(result.degraded).toBe(false)
    expect(result.toolsUsed).toContain('searchEbook')
    expect(result.steps.length).toBe(4)
  })

  it('默认 tool 集含本地电子书检索；未配 Tavily Key 时不注册网络搜索', async () => {
    const tools = await defaultTools()
    expect(tools.some((tool) => (tool as { name: string }).name === 'searchEbook')).toBe(true)
    expect(await createWebSearchTool()).toBeNull()
    expect(await loadMcpTools()).toEqual([])
  })

  it('配置了 Tavily Key 才注册现成网络搜索 tool', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test'
    const tool = await createWebSearchTool()
    expect(tool).not.toBeNull()
    delete process.env.TAVILY_API_KEY
  })
})
