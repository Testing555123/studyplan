'use client'

import { useEffect, useState } from 'react'

/**
 * AI 状态条（T12）：直接消费 /api/ai/status 的七字段（T11 / SPEC §8.4）。
 * 未配 Key 时 enabled:false，这里给出明确文案而不是空白。
 */
interface AiStatus {
  enabled: boolean
  keyConfigured: boolean
  model: string
  remainingToday: number
  limitPerDay: number
  codeIndexLoaded: boolean
  codeIndexFiles: number
}

export function AiStatusBar() {
  const [status, setStatus] = useState<AiStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/ai/status')
      .then((res) => res.json())
      .then((data: AiStatus) => {
        if (!cancelled) setStatus(data)
      })
      .catch(() => {
        if (!cancelled) setStatus(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const used = status ? status.limitPerDay - status.remainingToday : 0
  const percent = status ? Math.min(100, Math.round((used / status.limitPerDay) * 100)) : 0

  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-slate-300 backdrop-blur-xl">
      <span className="flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 rounded-full ${status?.enabled ? 'bg-emerald-400' : 'bg-amber-400'}`}
        />
        {status?.enabled ? 'AI 已启用' : 'AI 未启用（未配置 Key）'}
      </span>
      <span className="text-slate-400">模型：{status?.model || '未配置'}</span>
      <span className="flex items-center gap-2">
        <span className="text-slate-400">
          今日用量 {used}/{status?.limitPerDay ?? 300}
        </span>
        <span className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
          <span
            className="block h-full rounded-full bg-gradient-to-r from-cyan-400 to-indigo-500 transition-all"
            style={{ width: `${percent}%` }}
          />
        </span>
      </span>
      <span className="text-slate-400">
        知识库：{status?.codeIndexLoaded ? `${status.codeIndexFiles} 个片段` : '尚未构建'}
      </span>
    </div>
  )
}
