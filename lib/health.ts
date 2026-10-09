import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { HealthStatusSchema, type HealthStatus } from '@app/shared'

/**
 * 健康检查（T7）。只探测 PostgreSQL 连通性，不做统一包络（§8.1：健康检查独立于业务包络）。
 * - 连通 → { status:'ok', database:'connected' } + HTTP 200
 * - 断开 → { status:'degraded', database:'disconnected' } + HTTP 503
 * 探测失败不抛错，降级为 disconnected，保证探针本身不雪崩。
 */
export async function checkHealth(): Promise<{
  status: HealthStatus
  httpStatus: number
}> {
  let database: 'connected' | 'disconnected' = 'disconnected'
  try {
    await db.execute(sql`select 1`)
    database = 'connected'
  } catch {
    database = 'disconnected'
  }

  const status: HealthStatus = HealthStatusSchema.parse({
    status: database === 'connected' ? 'ok' : 'degraded',
    uptimeSeconds: Math.floor(process.uptime()),
    database,
    timestamp: new Date().toISOString(),
  })

  return {
    status,
    httpStatus: database === 'connected' ? 200 : 503,
  }
}
