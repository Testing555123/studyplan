'use client'

import type { ReactNode } from 'react'
import { AssistantRuntimeProvider } from '@assistant-ui/core/react'
import { useLocalRuntime, type ChatModelAdapter } from '@assistant-ui/react'

/**
 * assistant-ui runtime（T12）。
 *
 * 用现成的 assistant-ui 承载会话状态与流式渲染，后端只对接自研的 `/api/ai/ask` SSE
 * （T11 归属）：不自建聊天协议，逐块把 `delta` 事件喂给 runtime。
 */
interface SseEvent {
  event: string
  data: string
}

function parseSse(chunk: string): SseEvent[] {
  return chunk
    .split('\n\n')
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const lines = block.split('\n')
      const event = lines.find((line) => line.startsWith('event: '))?.slice(7) ?? 'message'
      const data = lines.find((line) => line.startsWith('data: '))?.slice(6) ?? ''
      return { event, data }
    })
}

async function* streamAsk(question: string, signal: AbortSignal) {
  const response = await fetch('/api/ai/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, mode: 'chat' }),
    signal,
  })

  if (!response.ok || !response.body) {
    yield { content: [{ type: 'text' as const, text: `请求失败（HTTP ${response.status}）` }] }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // 只处理完整事件块，残留半包留在 buffer 等下一帧。
    const tail = buffer.lastIndexOf('\n\n')
    if (tail === -1) continue
    const complete = buffer.slice(0, tail)
    buffer = buffer.slice(tail + 2)

    let webFallbackNotified = false
    let webFallback = false

    for (const event of parseSse(complete)) {
      if (event.event === 'meta') {
        const meta = JSON.parse(event.data) as {
          enabled?: boolean
          reason?: string
          fallback?: string | null
        }
        if (meta.enabled === false) {
          yield {
            content: [
              {
                type: 'text' as const,
                text: 'AI 服务未启用（未配置 AI_API_KEY / AI_BASE_URL），请联系管理员。',
              },
            ],
          }
          return
        }
        webFallback = meta.fallback === 'web-search'
        continue
      }
      if (event.event === 'error') {
        const error = JSON.parse(event.data) as { message?: string }
        yield { content: [{ type: 'text' as const, text: `出错了：${error.message ?? '未知错误'}` }] }
        return
      }
      if (event.event === 'delta') {
        const delta = JSON.parse(event.data) as { text?: string }
        if (delta.text) {
          // 网搜兜底徽标：首条 delta 前插入一次标记行（回答顶部轻量提示）。
          if (webFallback && !webFallbackNotified) {
            webFallbackNotified = true
            yield {
              content: [
                { type: 'text' as const, text: '🌐 _站内资料不足，已联网补充作答_\n\n' },
              ],
            }
          }
          yield { content: [{ type: 'text' as const, text: delta.text }] }
        }
      }
    }
  }
}

const adapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const last = messages[messages.length - 1]
    const question =
      last?.content
        ?.map((part) => (part.type === 'text' ? part.text : ''))
        .join('')
        .trim() ?? ''

    if (!question) {
      yield { content: [{ type: 'text', text: '请输入你想问的问题。' }] }
      return
    }

    yield* streamAsk(question, abortSignal)
  },
}

export function AiRuntimeProvider({ children }: { children: ReactNode }) {
  const runtime = useLocalRuntime(adapter)
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
