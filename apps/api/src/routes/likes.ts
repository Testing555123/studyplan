import type { Express, Request, Response } from 'express'
import type { Payload } from 'payload'
import {
  UUID_RE,
  adjustPostCounter,
  currentUser,
  fail,
  getPostCounters,
  isUniqueViolation,
  ok,
  postExists,
} from './context.js'

/**
 * likes 域。
 *
 * 与旧 LikesService 相同的幂等语义：PUT（赞）/ DELETE（取消）而不是 toggle ——
 * toggle 不幂等，网络重试会翻转状态；这两个接口调用一次和十次结果一致。
 *
 * 「不能重复点赞」下沉到数据库的复合唯一索引 (post, user)（对应 Mongo 11000
 * → PG 23505）：插入撞唯一索引 = 用户想要的状态已达成，返回 200 成功且
 * 不重复加计数 —— 快速连点不会把计数点出天际。
 *
 * 批次 6 的 `.strict()` 在本域没有落点：赞/取消的语义全在路径与令牌里，
 * **请求体压根不被读取**，所以「未知字段被静默丢弃」的风险等价地由「不读 body」挡住
 * —— body 里的 user / postId 既不参与鉴权也不参与写库（likes.spec.ts 钉住这条）。
 */

export function registerLikeRoutes(app: Express, payload: Payload) {
  // PUT /api/posts/:postId/like —— 点赞（幂等）
  app.put('/api/posts/:postId/like', async (req: Request, res: Response) => {
    const user = await currentUser(payload, req)
    if (!user) return fail(res, 401, 'unauthorized')

    const postId = String(req.params.postId)
    if (!UUID_RE.test(postId)) return fail(res, 404, 'not_found')

    try {
      if (!(await postExists(payload, postId))) return fail(res, 404, 'not_found')

      try {
        await payload.create({
          collection: 'likes',
          data: { post: postId, user: String(user.id) },
          overrideAccess: true,
        })
      } catch (err: unknown) {
        if (!isUniqueViolation(err)) throw err
        // 已经赞过 = 幂等成功，不重复加计数
        const counters = await getPostCounters(payload, postId)
        return ok(res, { liked: true, likeCount: counters?.likeCount ?? 0 })
      }

      const likeCount = await adjustPostCounter(payload, postId, 'like_count', 1)
      ok(res, { liked: true, likeCount: likeCount ?? 0 })
    } catch {
      fail(res, 500, 'internal_error')
    }
  })

  // DELETE /api/posts/:postId/like —— 取消点赞（幂等；没赞过也返回成功）
  app.delete('/api/posts/:postId/like', async (req: Request, res: Response) => {
    const user = await currentUser(payload, req)
    if (!user) return fail(res, 401, 'unauthorized')

    const postId = String(req.params.postId)
    if (!UUID_RE.test(postId)) return fail(res, 404, 'not_found')

    try {
      if (!(await postExists(payload, postId))) return fail(res, 404, 'not_found')

      // Payload Local API 没有按条件的 deleteMany，先查再删；
      // 唯一索引保证同一 (post, user) 至多一行，不存在并发双删的竞态。
      const found = await payload.find({
        collection: 'likes',
        where: { and: [{ post: { equals: postId } }, { user: { equals: String(user.id) } }] },
        limit: 1,
        overrideAccess: true,
      })
      const like = found.docs[0] as unknown as Record<string, unknown> | undefined

      if (!like) {
        // 本来就没赞过 —— 目标状态已达成，不重复减计数
        const counters = await getPostCounters(payload, postId)
        return ok(res, { liked: false, likeCount: counters?.likeCount ?? 0 })
      }

      await payload.delete({ collection: 'likes', id: String(like.id), overrideAccess: true })
      const likeCount = await adjustPostCounter(payload, postId, 'like_count', -1)
      ok(res, { liked: false, likeCount: likeCount ?? 0 })
    } catch {
      fail(res, 500, 'internal_error')
    }
  })
}
