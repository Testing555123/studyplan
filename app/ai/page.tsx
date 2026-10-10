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
    <main className="mx-auto max-w-5xl px-5 pb-16 pt-24">
      <header className="mb-6">
        <h1 className="bg-gradient-to-r from-indigo-300 via-cyan-300 to-violet-300 bg-clip-text text-[28px] font-semibold text-transparent">
          AI 助手
        </h1>
        <p className="mt-2 text-[15px] text-slate-400">
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
