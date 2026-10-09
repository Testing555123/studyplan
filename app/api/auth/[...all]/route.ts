import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/lib/auth/auth'
import { withRateLimit, type RateLimitTierName } from '@/lib/ratelimit'

const handlers = toNextJsHandler(auth)

/**
 * 限流档位按路径分发（SPEC §8.2，铁律 4：T8 只导出工厂/高阶函数，由 T3 调用挂载）。
 * - 注册 register 5 / 登录 login 10 / 续期 refresh 60
 * - 登出按 §8.2「只读豁免」不挂限流
 * - 其余走 default 30
 */
function tierFor(pathname: string): RateLimitTierName {
  if (pathname.includes('/sign-up')) return 'AUTH_REGISTER'
  if (pathname.includes('/sign-in')) return 'AUTH_LOGIN'
  if (pathname.includes('/token') || pathname.includes('/refresh')) return 'AUTH_REFRESH'
  return 'GLOBAL_DEFAULT'
}

function isExempt(pathname: string): boolean {
  return pathname.includes('/sign-out') || pathname.includes('/logout')
}

/** 单实例下用来源 IP 做 key（x-forwarded-for 首段）。 */
function clientKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
}

function withGuard(handler: (req: Request) => Promise<Response> | Response) {
  return (req: Request) => {
    const pathname = new URL(req.url).pathname
    if (isExempt(pathname)) return handler(req)
    return withRateLimit(tierFor(pathname), clientKey(req), () => handler(req))
  }
}

export const GET = withGuard(handlers.GET)
export const POST = withGuard(handlers.POST)
