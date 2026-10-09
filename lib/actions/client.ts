import { createSafeActionClient } from 'next-safe-action'
import { requireSession, AuthRequiredError } from '@/lib/auth/session'
import { toErrorBody } from './error'
import { ZodError } from 'zod'

/**
 * 基础安全动作客户端（T6）。
 * - 服务端错误统一映射为 @app/shared 错误语义；返回的 serverError 为可读 message。
 * - 业务 action 应使用 .strict() 输入 schema 以实现 V1（非法字段被拒，对应 400）。
 */
export const actionClient = createSafeActionClient({
  handleServerError(e) {
    if (e instanceof AuthRequiredError) {
      return 'UNAUTHORIZED'
    }
    if (e instanceof ZodError) {
      return 'BAD_REQUEST'
    }
    return 'INTERNAL'
  },
})

/**
 * 鉴权动作客户端（T6）。复用 T3 的 requireSession 作为唯一身份来源；
 * 未登录抛出 AuthRequiredError（401）。业务不得自行从输入读取身份字段。
 */
export const authedActionClient = actionClient.use(async () => {
  const session = await requireSession()
  return { success: true, data: { session } }
})
