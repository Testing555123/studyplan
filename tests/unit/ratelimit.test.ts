import { describe, expect, it } from 'vitest'
import { afterEach } from 'vitest'
import { __resetRateLimitStore, rateLimit, RATE_LIMIT_TIERS, type RateLimitTierName } from '@/lib/ratelimit'

afterEach(() => __resetRateLimitStore())

describe('rateLimit (T8)', () => {
  it('档位常量存在且为 12 个', () => {
    expect(Object.keys(RATE_LIMIT_TIERS)).toHaveLength(12)
  })

  it('默认档位 30/60s：第 31 次请求被限流', () => {
    const tier: RateLimitTierName = 'GLOBAL_DEFAULT'
    const key = 'ip-1'
    let limitedCount = 0
    for (let i = 0; i < 30; i++) {
      if (rateLimit(tier, key).limited) limitedCount++
    }
    expect(limitedCount).toBe(0)
    // 第 31 次
    expect(rateLimit(tier, key).limited).toBe(true)
  })

  it('同一档位不同 key 独立计数', () => {
    const tier: RateLimitTierName = 'GLOBAL_DEFAULT'
    for (let i = 0; i < 30; i++) rateLimit(tier, 'a')
    expect(rateLimit(tier, 'a').limited).toBe(true)
    expect(rateLimit(tier, 'b').limited).toBe(false)
  })

  it('不同档位使用各自阈值', () => {
    // AUTH_SIGNUP = 5/60s
    for (let i = 0; i < 5; i++) expect(rateLimit('AUTH_SIGNUP', 'x').limited).toBe(false)
    expect(rateLimit('AUTH_SIGNUP', 'x').limited).toBe(true)
  })

  it('返回 remaining 随请求递减', () => {
    const r1 = rateLimit('GLOBAL_DEFAULT', 'r')
    const r2 = rateLimit('GLOBAL_DEFAULT', 'r')
    expect(r2.remaining).toBe(r1.remaining - 1)
  })
})
