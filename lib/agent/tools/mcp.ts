/**
 * MCP 适配器预留（T13）。
 *
 * 默认**不启用**：stdio MCP 需常驻子进程（违反单容器单进程约束），
 * HTTP MCP 依赖外部服务（违反零新增组件）。仅当显式配置 MCP_ENDPOINT 时才加载。
 */
export interface AgentToolLike {
  name: string
}

export async function loadMcpTools(): Promise<AgentToolLike[]> {
  const endpoint = process.env.MCP_ENDPOINT
  if (!endpoint) return []

  const { MultiServerMCPClient } = await import('@langchain/mcp-adapters')
  const client = new MultiServerMCPClient({
    mcpServers: {
      remote: { url: endpoint },
    },
  })
  const tools = await client.getTools()
  return tools as unknown as AgentToolLike[]
}
