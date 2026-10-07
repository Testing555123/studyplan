import type { NextFunction, Request, Response } from 'express'
import { RateLimiterMemory } from 'rate-limiter-flexible'

/**
 * 逐路由限流（14 处档位）
 * ===================================================================
 * ⚠️ rate-limiter-flexible 的 `duration` 单位是【秒】，不是毫秒（第二轮已核实）。
 *    下面每个档位都由「次 / 分钟」换算成 duration: 60。
 *
 * ⚠️ Payload v3 已移除内置全局限流（issue #10321），且 Config 无 trustProxy 选项，
 *    所以本中间件必须挂在 `app.set('trust proxy', …)` 之后，否则 req.ip 拿不到真实
 *    客户端 IP → 全站退化成共用一个桶（PoC P2 要防的正是这个症状）。
 */

export const RATE_TIERS = {
  default: { points: 30, duration: 60 },
  register: { points: 5, duration: 60 },
  login: { points: 10, duration: 60 },
  refresh: { points: 60, duration: 60 },
  createPost: { points: 10, duration: 60 },
  aiAsk: { points: 10, duration: 60 },
  agentAsk: { points: 10, duration: 60 },
  semanticSearch: { points: 30, duration: 60 },
  askBook: { points: 10, duration: 60 },
  repoIntros: { points: 10, duration: 60 },
  digestRead: { points: 20, duration: 60 },
  digestGenerate: { points: 10, duration: 60 },
}

export type RateTier = keyof typeof RATE_TIERS

const limiters = new Map<RateTier, RateLimiterMemory>()
for (const [name, opts] of Object.entries(RATE_TIERS)) {
  limiters.set(name as RateTier, new RateLimiterMemory({ ...opts, keyPrefix: name }))
}

/** 登出与热门榜单【显式豁免】，不挂限流 */
export const EXEMPT_ROUTES = ['/api/auth/logout', '/api/trending']

export function rateLimit(tier: RateTier) {
  const limiter = limiters.get(tier)!
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await limiter.consume(req.ip ?? 'unknown')
      next()
    } catch {
      res.status(429).json({ error: { code: 'rate_limited', tier } })
    }
  }
}
