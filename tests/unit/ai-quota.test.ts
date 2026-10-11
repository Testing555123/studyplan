import { beforeEach, describe, expect, it, vi } from 'vitest'

const { insertReturningCount, selectRows, updateCalled } = vi.hoisted(() => ({
  insertReturningCount: { value: 1 },
  selectRows: { value: [] as { count: number }[] },
  updateCalled: { value: 0 },
}))

vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => ({
          returning: vi.fn(async () => [{ count: insertReturningCount.value }]),
        })),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => selectRows.value),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => {
          updateCalled.value += 1
          return []
        }),
      })),
    })),
  },
}))

const { consumeQuota, checkQuota, currentDayKey, getDailyLimit, DEFAULT_DAILY_LIMIT } = await import(
  '@/lib/ai/quota'
)

describe('每日额度（T11 / SPEC §8.4）', () => {
  beforeEach(() => {
    insertReturningCount.value = 1
    selectRows.value = []
    updateCalled.value = 0
    process.env.AI_DAILY_LIMIT = '300'
  })

  it('默认额度 300，env 可覆盖', () => {
    expect(getDailyLimit()).toBe(300)
    process.env.AI_DAILY_LIMIT = '50'
    expect(getDailyLimit()).toBe(50)
    delete process.env.AI_DAILY_LIMIT
    expect(getDailyLimit()).toBe(DEFAULT_DAILY_LIMIT)
  })

  it('自然日键为 UTC 日期串', () => {
    expect(currentDayKey(new Date('2026-10-10T23:59:59Z'))).toBe('2026-10-10')
  })

  it('第 300 次仍允许，第 301 次额度用尽', async () => {
    insertReturningCount.value = 300
    const ok = await consumeQuota()
    expect(ok.allowed).toBe(true)
    expect(ok.remaining).toBe(0)

    insertReturningCount.value = 301
    const exhausted = await consumeQuota()
    expect(exhausted.allowed).toBe(false)
    expect(exhausted.remaining).toBe(0)
    expect(updateCalled.value).toBe(1) // 超额回滚到上限，绝不越过 300
  })

  it('checkQuota 只判定不计数', async () => {
    selectRows.value = [{ count: 120 }]
    const state = await checkQuota()
    expect(state).toMatchObject({ used: 120, limit: 300, remaining: 180, allowed: true })
    expect(updateCalled.value).toBe(0)
  })

  it('额度用尽与限流是不同失败：额度用尽返回 allowed=false 供调用方回 402', async () => {
    selectRows.value = [{ count: 300 }]
    const state = await checkQuota()
    expect(state.allowed).toBe(false)
    expect(state.remaining).toBe(0)
  })
})
