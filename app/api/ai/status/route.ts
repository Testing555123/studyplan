import { NextResponse } from 'next/server'
import { getAiStatus } from '@/lib/ai/status'

/**
 * GET /api/ai/status（T11 / SPEC §8.4）
 * - 七字段原样返回（与 v2.0 契约一致），不套统一包络，便于前端直接消费。
 * - 未配 Key 仍是 **HTTP 200** + enabled:false（V5：未配 Key 不阻断应用）。
 * - 只读，被 middleware 的公开白名单放行。
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const status = await getAiStatus()
  return NextResponse.json(status, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}
