import { NextResponse } from 'next/server'
import { checkHealth } from '@/lib/health'

// 健康检查必须实时探测，禁用缓存。
export const dynamic = 'force-dynamic'

export async function GET() {
  const { status, httpStatus } = await checkHealth()
  return NextResponse.json(status, { status: httpStatus })
}
