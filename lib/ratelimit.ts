import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { errorEnvelope } from '@/lib/actions/envelope'

/**
 * 单实例内存限流（T8）。
 * - 12 档位常量值固定，不得更改（SPEC §8.2）。
 * - 默认档位 GLOBAL_DEFAULT = 30/60s；超限返回 429 + RATE_LIMITED。
 * - 只读路由不调用本模块即视为豁免（不挂限流）。
 * 注意：内存实现，仅单进程有效；多实例需 T12 接入 Redis。
 */
export interface RateLimitTier {
  limit: number
  windowSeconds: number
}

export const RATE_LIMIT_TIERS = {
  GLOBAL_DEFAULT: { limit: 30, windowSeconds: 60 },
  AUTH_SIGNUP: { limit: 5, windowSeconds: 60 },
  AUTH_LOGIN: { limit: 10, windowSeconds: 60 },
  AUTH_REFRESH: { limit: 30, windowSeconds: 60 },
  SEARCH: { limit: 30, windowSeconds: 60 },
  AI_CHAT: { limit: 6, windowSeconds: 60 },
  AI_EMBEDDING: { limit: 10, windowSeconds: 60 },
  EBOOK_READ: { limit: 60, windowSeconds: 60 },
  COMMENT_POST: { limit: 10, windowSeconds: 60 },
  UPLOAD: { limit: 5, windowSeconds: 60 },
  HEALTH: { limit: 60, windowSeconds: 60 },
  ADMIN: { limit: 120, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitTier>

export type RateLimitTierName = keyof typeof RATE_LIMIT_TIERS

interface WindowBucket {
  count: number
  resetAt: number
}

const store = new Map<string, WindowBucket>()

export interface RateLimitResult {
  limited: boolean
  limit: number
  remaining: number
  retryAfterSeconds: number
}

/** 内存固定窗口计数。tier 缺省为 GLOBAL_DEFAULT（30/60s）。 */
export function rateLimit(
  tier: RateLimitTierName = 'GLOBAL_DEFAULT',
  key = 'global',
): RateLimitResult {
  const { limit, windowSeconds } = RATE_LIMIT_TIERS[tier]
  const id = `${tier}:${key}`
  const now = Date.now()
  let bucket = store.get(id)

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowSeconds * 1000 }
    store.set(id, bucket)
  }

  if (bucket.count >= limit) {
    const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000)
    return { limited: true, limit, remaining: 0, retryAfterSeconds }
  }

  bucket.count += 1
  return {
    limited: false,
    limit,
    remaining: limit - bucket.count,
    retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
  }
}

/**
 * Route Handler 限流高阶函数。超限返回统一错误包络（429 / RATE_LIMITED）。
 * 只读路由不调用本函数即豁免。
 */
export function withRateLimit(
  tier: RateLimitTierName,
  key: string,
  handler: () => Promise<Response> | Response,
): Promise<Response> {
  const result = rateLimit(tier, key)
  if (result.limited) {
    logger.warn({ code: 'RATE_LIMITED', tier, key, retryAfterSeconds: result.retryAfterSeconds })
    return Promise.resolve(
      errorEnvelope({
        statusCode: 429,
        code: 'RATE_LIMITED',
        message: 'Too many requests',
      }),
    )
  }
  return Promise.resolve(handler())
}

/** 测试/运维辅助：清空限流计数（不改动档位常量）。 */
export function __resetRateLimitStore(): void {
  store.clear()
}
