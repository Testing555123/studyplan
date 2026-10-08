import type { Express, Request, Response } from 'express'
import type { Payload } from 'payload'
import { z } from 'zod'
import { avatarGradientIndex } from '@studyplan/shared'
import { currentUser, fail, ok, uniqueFieldOf } from './context.js'
import { toPublicUser } from './users.js'
import { rateLimit } from '../middleware/rate-limit.js'

/**
 * auth 域。
 *
 * 认证本体（密码哈希、登录校验、JWT 签发、登录尝试锁定）由 Payload
 * 的 auth 集合接管 —— 这里只剩「HTTP ↔ Local API」转接和入参校验。
 *
 * 与旧实现的差异（有意为之）：
 *   - 旧实现自带 refresh cookie 轮换；Payload 的 Local API 没有对应的
 *     refresh 操作，refresh 语义留到批次 6（错误包络）一并定夺，
 *     本批次不再自研 JWT 刷新（违反"不自研认证"纪律）。
 *   - 登录失败统一 401：刻意不区分「邮箱不存在」与「密码错误」—— 防账号枚举。
 *   - 请求体 .strict()（批次 6）：默认行为是静默丢弃未知字段，而注册是全站唯一的
 *     建用户入口，body 里多出的 role / provider 被丢掉后仍回 201，
 *     客户端会以为自己已经提权 —— 必须 400 让它看得见。
 */

export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('email 格式不合法'),
    username: z.string().trim().min(2, 'username 至少 2 个字符').max(30, 'username 至多 30 个字符'),
    password: z.string().min(8, 'password 至少 8 个字符').max(72, 'password 至多 72 个字符'),
  })
  .strict()

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase(),
    password: z.string().min(1),
  })
  .strict()

export function registerAuthRoutes(app: Express, payload: Payload) {
  app.post('/api/auth/register', rateLimit('register'), async (req: Request, res: Response) => {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      return fail(res, 400, 'validation_failed', parsed.error.issues[0]?.message)
    }
    const { email, username, password } = parsed.data
    try {
      const created = (await payload.create({
        collection: 'users',
        data: {
          email,
          username,
          password,
          // 头像色由用户名确定性推导（与 shared 同一函数，前后端一致）
          avatarGradient: avatarGradientIndex(username),
        },
        overrideAccess: true,
      })) as unknown as Record<string, unknown>

      const login = await payload.login({ collection: 'users', data: { email, password } })
      ok(res, { user: toPublicUser(created), token: login.token }, 201)
    } catch (err: unknown) {
      const field = uniqueFieldOf(err)
      if (field) {
        // 数据库层的技术错误翻译成用户能懂的业务错误（旧实现为 409 Conflict）
        return fail(
          res,
          409,
          'conflict',
          field === 'email' ? '这个邮箱已经被注册了，换一个或直接登录' : '这个用户名已被占用',
        )
      }
      // 明细只进日志（批次 6「响应体无堆栈」）：唯一冲突之外的上游错误原文常带
      // SQL、绝对路径甚至堆栈，透传给客户端等于暴露内部实现。
      console.error('[auth] register failed:', err)
      fail(res, 400, 'register_failed', '注册失败，请稍后重试')
    }
  })

  app.post('/api/auth/login', rateLimit('login'), async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      // 未知字段属于「客户端拼错了 body」：还没碰数据库、也与凭据无关，给 400 才诊断得出来；
      // 其余（缺字段 / 空值）继续统一 401，不区分邮箱是否存在。
      return parsed.error.issues.some((issue) => issue.code === 'unrecognized_keys')
        ? fail(res, 400, 'validation_failed', parsed.error.issues[0]?.message)
        : fail(res, 401, 'invalid_credentials')
    }
    try {
      const login = await payload.login({ collection: 'users', data: parsed.data })
      ok(res, {
        user: toPublicUser(login.user as unknown as Record<string, unknown>),
        token: login.token,
      })
    } catch {
      fail(res, 401, 'invalid_credentials')
    }
  })

  app.get('/api/auth/me', async (req: Request, res: Response) => {
    const user = await currentUser(payload, req)
    if (!user) return fail(res, 401, 'unauthorized')
    ok(res, { user: toPublicUser(user as unknown as Record<string, unknown>) })
  })
}
