import type { Metadata } from 'next'
import { AiChat } from '@/components/ai/chat'
import { AiRuntimeProvider } from '@/components/ai/provider'
import { AiStatusBar } from '@/components/ai/status-bar'

export const metadata: Metadata = {
  title: 'AI 助手 | StudyPlan',
  description: '基于站内电子书语料的检索问答助手，答案只依据资料，绝不编造来源。',
}

/** AI 助手页（T12）。 */
export default function AiPage() {
  return (
    <main id="main-content" className="mx-auto max-w-5xl px-5 pb-16 pt-24">
      <header className="mb-6">
        <h1 className="text-headline-medium font-medium text-on-surface">
          AI 助手
        </h1>
        <p className="mt-2 text-body-large text-on-surface-variant">
          用自然语言提问，助手会在站内电子书里检索相关资料后作答；资料里没有的内容会如实说明。
        </p>
      </header>

      <AiStatusBar />

      <AiRuntimeProvider>
        <AiChat />
      </AiRuntimeProvider>
    </main>
  )
}
