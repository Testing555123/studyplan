import type { Request, Response } from 'express'
import type { Payload } from 'payload'
import { AVATAR_GRADIENTS, avatarGradientIndex, type PublicUser } from '@studyplan/shared'
import { fail, ok } from './context.js'

/**
 * users 域。
 *
 * Mongoose 时代这个域有三个角色：创建用户、按邮箱查认证行、公开资料映射。
 * 前两个已被 Payload 接管（auth 集合：注册时 payload.create、登录时 payload.login），
 * 这里保留的是**第三个角色** —— 公开资料映射，即 R-C 三道闸门的闸门 3 载体。
 *
 * 批次 6 的 `.strict()` 在本域没有落点：只有一个 GET，**请求体不被读取**，
 * where 条件只取路径参数（users.spec.ts 里锁死了「body 传什么都不进 where」）。
 */

/** toPublicUser 允许输出的键集合（闸门 3 的机器可校验形式，与 poc/p31-gates.mjs 一致） */
export const PUBLIC_USER_KEYS = [
  'id',
  'email',
  'username',
  'avatarColor',
  'bio',
  'createdAt',
] as const

/**
 * 输出期闸门（闸门 3）：逐字段挑选，不是"整体发送再删敏感的"。
 * Payload 的 Local API 文档会带出 hash / salt / loginAttempts 等内部字段，
 * 只要有任何一条路径直接 res.json(user)，它们就全量泄漏 —— 所以必须过这里。
 */
export function toPublicUser(user: Record<string, unknown>): PublicUser {
  return {
    id: String(user.id),
    email: String(user.email),
    username: String(user.username),
    avatarColor: AVATAR_GRADIENTS[Number(user.avatarGradient ?? 0)],
    bio: (user.bio as string | null) ?? undefined,
    createdAt: new Date(user.createdAt as string).toISOString(),
  }
}

/** GET /api/users/:username —— 公开资料（按用户名） */
export function registerUserRoutes(app: import('express').Express, payload: Payload) {
  app.get('/api/users/:username', async (req: Request, res: Response) => {
    try {
      const found = await payload.find({
        collection: 'users',
        where: { username: { equals: String(req.params.username) } },
        limit: 1,
        overrideAccess: true,
      })
      const doc = found.docs[0] as unknown as Record<string, unknown> | undefined
      if (!doc) return fail(res, 404, 'not_found')
      ok(res, { user: toPublicUser(doc) })
    } catch {
      fail(res, 500, 'internal_error')
    }
  })
}
