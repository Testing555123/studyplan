'use client'

import {
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from '@assistant-ui/react'

/**
 * AI 助手聊天界面（T12）。
 * 用 assistant-ui 现成原语承载消息列表、流式渲染与输入框，
 * 视觉走站点统一的 M3 派生扁平设计语言（令牌化表面与强调色）。
 */

function UserMessage() {
  return (
    <div className="mb-5 flex justify-end">
      <div className="max-w-[78%] rounded-lg rounded-br-sm bg-primary px-4 py-3 text-body-large leading-relaxed text-on-primary">
        <MessagePrimitive.Parts />
      </div>
    </div>
  )
}

function AssistantMessage() {
  return (
    <div className="mb-5 flex justify-start">
      <div className="max-w-[78%] rounded-lg rounded-bl-sm border border-outline-variant bg-surface-container-highest px-4 py-3 text-body-large leading-relaxed text-on-surface">
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
    <ThreadPrimitive.Root className="flex h-[70vh] w-full flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface-container-high">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-5 py-6">
        <ThreadPrimitive.Empty>
          <div className="mx-auto max-w-xl py-16 text-center">
            <p className="text-headline-small font-medium text-on-surface">
              问我任何关于站内电子书的问题
            </p>
            <p className="mt-3 text-body-medium text-on-surface-variant">
              答案只依据站内资料；资料里没有的内容会明确告诉你，不会编造来源。
            </p>
          </div>
        </ThreadPrimitive.Empty>

        <ThreadPrimitive.Messages components={MESSAGE_COMPONENTS} />

        <ThreadPrimitive.If running>
          <div className="mb-5 flex justify-start">
            <div className="flex gap-1.5 rounded-lg border border-outline-variant bg-surface-container-highest px-4 py-4">
              <span className="h-2 w-2 animate-bounce rounded-full bg-on-surface-variant [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-on-surface-variant [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-on-surface-variant" />
            </div>
          </div>
        </ThreadPrimitive.If>

        <ThreadPrimitive.ViewportFooter className="sticky bottom-0 border-t border-outline-variant bg-surface-container-high pb-1 pt-4">
          <ComposerPrimitive.Root className="flex items-end gap-3 rounded-lg border border-outline-variant bg-surface-container-highest px-4 py-4">
            <ComposerPrimitive.Input
              autoFocus
              placeholder="就电子书内容提问，Enter 发送…"
              aria-label="向 AI 提问"
              rows={1}
              className="min-h-[48px] flex-1 resize-none rounded-lg border border-outline-variant bg-surface-container px-4 py-3 text-body-large text-on-surface outline-none transition placeholder:text-on-surface-variant focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <ThreadPrimitive.If running={false}>
              <ComposerPrimitive.Send
                aria-label="发送"
                className="h-12 rounded-lg bg-primary px-6 text-label-large font-medium text-on-primary transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                发送
              </ComposerPrimitive.Send>
            </ThreadPrimitive.If>
            <ThreadPrimitive.If running>
              <ComposerPrimitive.Cancel
                aria-label="停止"
                className="h-12 rounded-lg border border-outline-variant bg-surface-container-highest px-6 text-label-large font-medium text-on-surface transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-50"
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
