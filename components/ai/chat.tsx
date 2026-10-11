'use client'

import {
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from '@assistant-ui/react'

/**
 * AI 助手聊天界面（T12）。
 * 用 assistant-ui 现成原语承载消息列表、流式渲染与输入框，
 * 视觉走站点统一的「玻璃质感 + 青紫渐变」语言。
 */

function UserMessage() {
  return (
    <div className="mb-5 flex justify-end">
      <div className="max-w-[78%] rounded-2xl rounded-br-sm bg-gradient-to-br from-indigo-500 to-violet-500 px-4 py-3 text-[15px] leading-relaxed text-white shadow-lg shadow-indigo-500/20">
        <MessagePrimitive.Parts />
      </div>
    </div>
  )
}

function AssistantMessage() {
  return (
    <div className="mb-5 flex justify-start">
      <div className="max-w-[78%] rounded-2xl rounded-bl-sm border border-white/10 bg-white/[0.06] px-4 py-3 text-[15px] leading-relaxed text-slate-100">
        <MessagePrimitive.Parts />
      </div>
    </div>
  )
}

const MESSAGE_COMPONENTS = {
  UserMessage,
  AssistantMessage,
}

export function AiChat() {
  return (
    <ThreadPrimitive.Root className="flex h-[70vh] w-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] shadow-[0_8px_40px_-12px_rgba(99,102,241,0.45)] backdrop-blur-xl">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-5 py-6">
        <ThreadPrimitive.Empty>
          <div className="mx-auto max-w-xl py-16 text-center">
            <p className="bg-gradient-to-r from-indigo-300 via-cyan-300 to-violet-300 bg-clip-text text-2xl font-semibold text-transparent">
              问我任何关于站内电子书的问题
            </p>
            <p className="mt-3 text-sm text-slate-400">
              答案只依据站内资料；资料里没有的内容会明确告诉你，不会编造来源。
            </p>
          </div>
        </ThreadPrimitive.Empty>

        <ThreadPrimitive.Messages components={MESSAGE_COMPONENTS} />

        <ThreadPrimitive.If running>
          <div className="mb-5 flex justify-start">
            <div className="flex gap-1.5 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-4">
              <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-300 [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-300 [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-violet-300" />
            </div>
          </div>
        </ThreadPrimitive.If>

        <ThreadPrimitive.ViewportFooter className="sticky bottom-0 bg-gradient-to-t from-slate-950/80 to-transparent pb-1 pt-4">
          <ComposerPrimitive.Root className="flex items-end gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 backdrop-blur-xl">
            <ComposerPrimitive.Input
              autoFocus
              placeholder="就电子书内容提问，Enter 发送…"
              rows={1}
              className="min-h-[48px] flex-1 resize-none rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-[15px] text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20"
            />
            <ThreadPrimitive.If running={false}>
              <ComposerPrimitive.Send
                aria-label="发送"
                className="h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-500 px-5 text-sm font-medium text-slate-950 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                发送
              </ComposerPrimitive.Send>
            </ThreadPrimitive.If>
            <ThreadPrimitive.If running>
              <ComposerPrimitive.Cancel
                aria-label="停止"
                className="h-12 rounded-xl border border-white/15 bg-white/5 px-5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
              >
                停止
              </ComposerPrimitive.Cancel>
            </ThreadPrimitive.If>
          </ComposerPrimitive.Root>
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  )
}
