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
    // P0-2 双层校验：连通之外确认迁移已落地，防止空库被误判就绪放行流量。
    const res = await db.execute(
      sql`SELECT 1 FROM drizzle.__drizzle_migrations LIMIT 1`,
    )
    const rowCount = (res as unknown as { rowCount: number | null }).rowCount
    if (rowCount !== null && rowCount > 0) {
      database = 'connected'
    }
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
