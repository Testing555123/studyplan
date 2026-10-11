import { afterEach, describe, expect, it } from 'vitest'
import {
  __resetRateLimitStore,
  rateLimit,
  RATE_LIMIT_TIERS,
  type RateLimitTierName,
} from '@/lib/ratelimit'

afterEach(() => __resetRateLimitStore())

/** SPEC §8.2 契约档位：键名与 limit 均为固定值，实现时不得改动。 */
const CONTRACT_TIERS: Record<string, number> = {
  GLOBAL_DEFAULT: 30,
  AUTH_REGISTER: 5,
  AUTH_LOGIN: 10,
  AUTH_REFRESH: 60,
  CREATE_POST: 10,
  AI_ASK: 10,
  AGENT_ASK: 10,
  SEMANTIC_SEARCH: 30,
  ASK_BOOK: 10,
  REPO_INTROS: 10,
  DIGEST_READ: 20,
  DIGEST_GENERATE: 10,
}

describe('rateLimit (T8)', () => {
  it('档位常量与 SPEC §8.2 契约一一对应（12 档）', () => {
    expect(Object.keys(RATE_LIMIT_TIERS)).toHaveLength(12)
    expect(RATE_LIMIT_TIERS).toMatchObject(
      Object.fromEntries(
        Object.entries(CONTRACT_TIERS).map(([tier, limit]) => [
          tier,
          { limit, windowSeconds: 60 },
        ]),
      ),
    )
    for (const [tier, limit] of Object.entries(CONTRACT_TIERS)) {
      expect(RATE_LIMIT_TIERS[tier as RateLimitTierName].limit).toBe(limit)
      expect(RATE_LIMIT_TIERS[tier as RateLimitTierName].windowSeconds).toBe(60)
    }
  })

  it('默认档位 30/60s：第 31 次请求被限流', () => {
    const tier: RateLimitTierName = 'GLOBAL_DEFAULT'
    const key = 'ip-1'
    for (let i = 0; i < 30; i++) {
      expect(rateLimit(tier, key).limited).toBe(false)
    }
    expect(rateLimit(tier, key).limited).toBe(true)
  })

  it('同一档位不同 key 独立计数', () => {
    const tier: RateLimitTierName = 'GLOBAL_DEFAULT'
    for (let i = 0; i < 30; i++) rateLimit(tier, 'a')
    expect(rateLimit(tier, 'a').limited).toBe(true)
    expect(rateLimit(tier, 'b').limited).toBe(false)
  })

  it('注册档位 5/60s', () => {
    for (let i = 0; i < 5; i++) expect(rateLimit('AUTH_REGISTER', 'x').limited).toBe(false)
    expect(rateLimit('AUTH_REGISTER', 'x').limited).toBe(true)
  })

  it('登录档位 10/60s', () => {
    for (let i = 0; i < 10; i++) expect(rateLimit('AUTH_LOGIN', 'x').limited).toBe(false)
    expect(rateLimit('AUTH_LOGIN', 'x').limited).toBe(true)
  })

  it('续期档位 60/60s：前端静默续期需要更高额度', () => {
    for (let i = 0; i < 60; i++) expect(rateLimit('AUTH_REFRESH', 'x').limited).toBe(false)
    expect(rateLimit('AUTH_REFRESH', 'x').limited).toBe(true)
  })

  it('AI 问答与 Agent 问答各 10/60s 且分开计数', () => {
    for (let i = 0; i < 10; i++) expect(rateLimit('AI_ASK', 'x').limited).toBe(false)
    expect(rateLimit('AI_ASK', 'x').limited).toBe(true)
    expect(rateLimit('AGENT_ASK', 'x').limited).toBe(false)
  })

  it('返回 remaining 随请求递减', () => {
    const r1 = rateLimit('GLOBAL_DEFAULT', 'r')
    const r2 = rateLimit('GLOBAL_DEFAULT', 'r')
    expect(r2.remaining).toBe(r1.remaining - 1)
  })
})
