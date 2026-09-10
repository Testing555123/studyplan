import type { Request } from 'express'

/** Refresh Token 在 Cookie 里的名字 */
export const REFRESH_COOKIE_NAME = 'sp_refresh_token'

/**
 * 从请求里读一个 Cookie 的值。
 *
 * 为什么自己解析，而不是装 `cookie-parser`？
 *   因为 Cookie 的本质就是**一个普通的请求头**：
 *
 *   ```text
 *   Cookie: a=1; b=2; sp_refresh_token=eyJhbGci...
 * ```
 *
 *   我们全站只有一个 Cookie 要读，十几行代码就能处理完，
 *   没必要为此引入一个依赖和一处全局中间件配置。
 *
 *   > 这不是"为了省一个包"，而是一个更普遍的原则：
 *   > **在引入依赖之前，先看清你要解决的问题有多大。**
 *   > 如果问题只有十几行，那么引入依赖带来的
 *   > （版本升级、安全公告、行为变化）维护成本会超过收益。
 *
 * 什么时候该换成 cookie-parser？
 *   当你要读的 Cookie 超过三四个，或者需要"签名校验"、
 *   "带 JSON 值的 Cookie"这类高级功能时。那时候自己写就会开始出错。
 *
 * 两个容易踩的细节：
 *   1. Cookie 之间用 `; `（分号 + 空格）分隔，但浏览器不一定保证这个空格，
 *      所以更稳妥的做法是按 `;` 切分再 `trim`；
 *   2. 值可能被 URL 编码过（`encodeURIComponent`），所以要 decode 一次。
 *      JWT 只包含 `A-Za-z0-9-_.`，其实不会被编码，但保持正确性更省心。
 */
export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie
  if (!header) return undefined

  const prefix = `${name}=`
  for (const part of header.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(prefix)) {
      const raw = trimmed.slice(prefix.length)
      try {
        return decodeURIComponent(raw)
      } catch {
        // 万一解码失败（值本身有非法的百分号序列），
        // 就返回原始值 —— 反正后续的签名校验会把它拦下来。
        return raw
      }
    }
  }

  return undefined
}
