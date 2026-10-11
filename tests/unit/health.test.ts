import { beforeEach, describe, expect, it, vi } from 'vitest'

// 单测不依赖真实 PostgreSQL：mock 掉 db.execute，直接覆盖连通/断连两条路径。
const { execute } = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { execute } }))

const { checkHealth } = await import('@/lib/health')

describe('checkHealth (T7)', () => {
  beforeEach(() => {
    execute.mockReset()
  })

  it('DB 可达时返回 ok / 200 / database:connected', async () => {
    execute.mockResolvedValue({ rows: [{ '?column?': 1 }] })
    const { status, httpStatus } = await checkHealth()
    expect(status.database).toBe('connected')
    expect(status.status).toBe('ok')
    expect(httpStatus).toBe(200)
    expect(typeof status.uptimeSeconds).toBe('number')
  })

  it('DB 不可达时返回 degraded / 503 / database:disconnected（不抛错）', async () => {
    execute.mockRejectedValue(new Error('ECONNREFUSED'))
    const { status, httpStatus } = await checkHealth()
    expect(status.database).toBe('disconnected')
    expect(status.status).toBe('degraded')
    expect(httpStatus).toBe(503)
  })
})
