import { headers } from 'next/headers'
import { auth } from './auth'

export type Session = Awaited<ReturnType<typeof auth.api.getSession>>

/** 读取当前会话（T3）。返回 null 表示未登录。 */
export async function getSession(): Promise<Session> {
  return auth.api.getSession({ headers: await headers() })
}

/** 未登录时抛出的错误，携带 401 状态码，供 T6/T3 受保护路由映射响应。 */
export class AuthRequiredError extends Error {
  statusCode = 401
  code = 'UNAUTHORIZED'
  constructor(message = 'UNAUTHORIZED') {
    super(message)
    this.name = 'AuthRequiredError'
  }
}

/**
 * 受保护路由唯一身份来源（V1）。
 * 调用方必须且仅能从此处取得身份，禁止从请求体读取 authorId/role 等字段。
 * 未登录抛出 AuthRequiredError（401）。
 */
export async function requireSession() {
  const session = await getSession()
  if (!session) throw new AuthRequiredError()
  return session
}
