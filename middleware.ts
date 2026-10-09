import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

/**
 * 会话守卫（T3）。
 * - 只做 Cookie 级轻量检查（getSessionCookie 不查库），数据库级会话校验仍由 requireSession() 负责，避免双查库。
 * - 未携带会话 Cookie 访问受保护前缀 → 401 + ErrorBody 形状（SPEC §1.1），与 T6 包络一致。
 * - 此处刻意不 import @app/shared / lib/db：middleware 运行在 edge runtime，
 *   不得引入 env 校验（DATABASE_URL 缺失时抛错）与 pg 依赖。
 */
const PROTECTED_PREFIXES = ['/api/ai', '/dashboard']

/** 与 createRequestId() 同语义（crypto.randomUUID），此处避免引入 env 校验副作用。 */
function newRequestId(): string {
  return crypto.randomUUID()
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const needsSession = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))

  if (needsSession && !getSessionCookie(req)) {
    const requestId = newRequestId()
    return NextResponse.json(
      {
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: '请先登录',
        requestId,
        timestamp: new Date().toISOString(),
      },
      { status: 401, headers: { 'X-Request-Id': requestId } },
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/ai/:path*', '/dashboard/:path*'],
}
