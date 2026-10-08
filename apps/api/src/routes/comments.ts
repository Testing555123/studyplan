import type { Express, Request, Response } from 'express'
import type { Payload } from 'payload'
import { z } from 'zod'
import { COMMENT_MAX_LENGTH } from '@studyplan/shared'
import {
  UUID_RE,
  adjustPostCounter,
  currentUser,
  fail,
  ok,
  postExists,
  relId,
  toCommentContract,
} from './context.js'

/**
 * comments 域。
 *
 * 行为契约与旧 CommentsService 对齐：
 *   - 路由形态沿用旧的取舍：列表/创建挂在嵌套路径（从属关系），
 *     删除用扁平路径 /comments/:id（评论 id 已全局唯一）；
 *   - 列表按时间正序，最早在前；
 *   - 发评论：校验帖子存在 → 写入 → 原子加评论计数（计数是展示用派生数据，
 *     旧实现刻意不引入事务，本批次维持同一取舍）；
 *   - 删除：只能删自己的，「不存在 404」与「不是你的 403」区分；删成功才减计数。
 */

/**
 * 请求体 .strict()（批次 6「多传字段返回 400」）：`post` 和 `authorId` 都是路由
 * 自己从路径与令牌注入的，body 里出现同名字段必须报错。默认行为是静默丢弃 ——
 * 前端会以为自己评论到了另一篇帖子上，这种 bug 只看响应码是查不出来的。
 */
export const createCommentSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, '评论不能为空')
      .max(COMMENT_MAX_LENGTH, `评论至多 ${COMMENT_MAX_LENGTH} 字`),
  })
  .strict()

export function registerCommentRoutes(app: Express, payload: Payload) {
  // GET /api/posts/:postId/comments
  app.get('/api/posts/:postId/comments', async (req: Request, res: Response) => {
    const postId = String(req.params.postId)
    if (!UUID_RE.test(postId)) return fail(res, 404, 'not_found')
    try {
      if (!(await postExists(payload, postId))) return fail(res, 404, 'not_found')
      const found = await payload.find({
        collection: 'comments',
        where: { post: { equals: postId } },
        sort: 'createdAt',
        limit: 1000,
        overrideAccess: true,
      })
      const items = (found.docs as unknown as Record<string, unknown>[]).map(toCommentContract)
      ok(res, { items, total: items.length })
    } catch {
      fail(res, 500, 'internal_error')
    }
  })

  // POST /api/posts/:postId/comments —— 需要登录
  app.post('/api/posts/:postId/comments', async (req: Request, res: Response) => {
    const user = await currentUser(payload, req)
    if (!user) return fail(res, 401, 'unauthorized')

    const postId = String(req.params.postId)
    if (!UUID_RE.test(postId)) return fail(res, 404, 'not_found')

    const parsed = createCommentSchema.safeParse(req.body)
    if (!parsed.success) {
      return fail(res, 400, 'validation_failed', parsed.error.issues[0]?.message)
    }

    try {
      if (!(await postExists(payload, postId))) return fail(res, 404, 'not_found')

      const created = await payload.create({
        collection: 'comments',
        data: {
          post: postId,
          content: parsed.data.content,
          authorId: String(user.id),
          authorUsername: user.username,
        },
        overrideAccess: true,
      })
      await adjustPostCounter(payload, postId, 'comment_count', 1)

      ok(res, toCommentContract(created as unknown as Record<string, unknown>), 201)
    } catch {
      fail(res, 500, 'internal_error')
    }
  })

  // DELETE /api/comments/:id —— 只能删自己的；204
  app.delete('/api/comments/:id', async (req: Request, res: Response) => {
    const user = await currentUser(payload, req)
    if (!user) return fail(res, 401, 'unauthorized')

    const commentId = String(req.params.id)
    if (!UUID_RE.test(commentId)) return fail(res, 404, 'not_found')

    try {
      const existing = await payload.findByID({
        collection: 'comments',
        id: commentId,
        disableErrors: true,
        overrideAccess: true,
      })
      if (!existing) return fail(res, 404, 'not_found')
      const doc = existing as unknown as Record<string, unknown>
      if (String(doc.authorId) !== String(user.id)) {
        return fail(res, 403, 'forbidden')
      }

      await payload.delete({ collection: 'comments', id: commentId, overrideAccess: true })
      // 删成功了才减计数（计数侧另有 GREATEST(0, …) 兜底）
      await adjustPostCounter(payload, relId(doc.post), 'comment_count', -1)

      res.status(204).end()
    } catch {
      fail(res, 500, 'internal_error')
    }
  })
}
