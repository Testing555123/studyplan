import { describe, expect, it } from 'vitest'
import { checkHealth } from '@/lib/health'

describe('checkHealth (T7)', () => {
  it('DB 可达时返回 ok / 200 / database:connected', async () => {
    const { status, httpStatus } = await checkHealth()
    expect(status.database).toBe('connected')
    expect(status.status).toBe('ok')
    expect(httpStatus).toBe(200)
    expect(typeof status.uptimeSeconds).toBe('number')
  })
})
