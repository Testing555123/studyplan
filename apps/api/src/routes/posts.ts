import type { Express, Request, Response } from 'express'
import { sql } from 'drizzle-orm'
import type { Payload } from 'payload'
import { z } from 'zod'
import {
  CONTENT_MAX_LENGTH,
  CONTENT_MIN_LENGTH,
  MAX_TAGS_PER_POST,
  POST_TAGS,
  TITLE_MAX_LENGTH,
  TITLE_MIN_LENGTH,
} from '@studyplan/shared'
import { UUID_RE, currentUser, fail, ok, toPostContract } from './context.js'
import { rateLimit } from '../middleware/rate-limit.js'

/**
 * posts 域。
 *
 * 行为契约与旧 PostsService 对齐：
 *   - 非法 id / 不存在的 id 统一 404（不暴露存储实现细节，也不让 PG 抛 500）；
 *   - 「存在但非本人」403 与「不存在」404 必须区分（FR-POST-3）；
 *   - 更新只改传入的字段（undefined 过滤）；
 *   - 身份只来自令牌，客户端传 authorId 也不采信。
 *
 * AI 摘要增强（旧 enrichWithAi 旁路）不在本批次：批次 4 换 Vercel AI SDK + 本地
 * embed 时一并重建，这里刻意留白。
 */

const PAGE_DEFAULT = 1
const PAGE_SIZE_DEFAULT = 20
const PAGE_SIZE_MAX = 100

/**
 * 请求体一律 .strict()（批次 6「多传 authorId 返回 400」）。
 * 默认行为是**静默丢弃**未知字段：客户端以为自己传了 authorId 就能代发，
 * 服务端却一声不响地按令牌里的身份发帖 —— 201 成功但其实什么都没发生，
 * 这种 bug 前端永远查不出来。宁可 400 让它看得见。
 */
export const createPostSchema = z
  .object({
    title: z.string().trim().min(TITLE_MIN_LENGTH).max(TITLE_MAX_LENGTH),
    content: z.string().min(CONTENT_MIN_LENGTH).max(CONTENT_MAX_LENGTH),
    tags: z.array(z.enum(POST_TAGS)).min(1).max(MAX_TAGS_PER_POST),
  })
  .strict()

export const updatePostSchema = z
  .object({
    title: z.string().trim().min(TITLE_MIN_LENGTH).max(TITLE_MAX_LENGTH).optional(),
    content: z.string().min(CONTENT_MIN_LENGTH).max(CONTENT_MAX_LENGTH).optional(),
    tags: z.array(z.enum(POST_TAGS)).min(1).max(MAX_TAGS_PER_POST).optional(),
    summary: z.string().max(CONTENT_MAX_LENGTH).optional(),
  })
  .strict()

/**
 * 标签筛选（偏差 #2 处置后的新语义）：tags 现在是 jsonb 数组。
 * OR 语义命中任意一个 —— 等价于旧 Mongo 的 { tags: { $in: tags } }。
 * 走 jsonb_array_elements_text 展开后等值匹配，未来的 GIN(tags) 索引
 * 也可以换成 `tags @> '["x"]'` 的形式，两种写法都能吃到索引。
 */
async function findPostIdsByTags(payload: Payload, tagList: string[]): Promise<string[]> {
  // ⚠️ drizzle 不会把 JS 数组绑定成 PG 数组（报 malformed array literal），
  //    所以逐标签生成标量参数，用 OR 连接（OR 语义 = 旧 Mongo 的 $in）。
  const conds = tagList.map((t) => sql`t.value::text = ${t}`)
  const result = (await payload.db.drizzle.execute(
    sql`SELECT id FROM posts
        WHERE EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(tags) AS t(value)
          WHERE ${sql.join(conds, sql` OR `)}
        )`,
  )) as unknown as { rows?: Array<{ id: string }> }
  return (result?.rows ?? []).map((r) => String(r.id))
}

export function registerPostRoutes(app: Express, payload: Payload) {
  // GET /api/posts —— 分页 + 标签筛选
  app.get('/api/posts', async (req: Request, res: Response) => {
    const page = Math.max(Number(req.query.page ?? PAGE_DEFAULT) || PAGE_DEFAULT, 1)
    const pageSize = Math.min(
      Math.max(Number(req.query.pageSize ?? PAGE_SIZE_DEFAULT) || PAGE_SIZE_DEFAULT, 1),
      PAGE_SIZE_MAX,
    )

    // 多标签 > 单标签 > 全部（优先级与旧实现一致）
    const tagParam = String(req.query.tag ?? '').trim()
    const tagsParam = String(req.query.tags ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    const tagList = tagsParam.length ? tagsParam : tagParam ? [tagParam] : []

    try {
      if (tagList.length) {
        const ids = await findPostIdsByTags(payload, tagList)
        if (!ids.length) {
          return ok(res, { items: [], total: 0, page, pageSize })
        }
        const found = await payload.find({
          collection: 'posts',
          where: { id: { in: ids } },
          sort: '-createdAt',
          page,
          limit: pageSize,
          overrideAccess: true,
        })
        return ok(res, {
          items: (found.docs as unknown as Record<string, unknown>[]).map(toPostContract),
          total: found.totalDocs,
          page,
          pageSize,
        })
      }

      const found = await payload.find({
        collection: 'posts',
        sort: '-createdAt',
        page,
        limit: pageSize,
        overrideAccess: true,
      })
      ok(res, {
        items: (found.docs as unknown as Record<string, unknown>[]).map(toPostContract),
        total: found.totalDocs,
        page,
        pageSize,
      })
    } catch {
      fail(res, 500, 'internal_error')
    }
  })

  // GET /api/posts/:id
  app.get('/api/posts/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id)
    if (!UUID_RE.test(id)) return fail(res, 404, 'not_found')
    try {
      const doc = await payload.findByID({
        collection: 'posts',
        id,
        disableErrors: true,
        overrideAccess: true,
      })
      if (!doc) return fail(res, 404, 'not_found')
      ok(res, toPostContract(doc as unknown as Record<string, unknown>))
    } catch {
      fail(res, 500, 'internal_error')
    }
  })

  // POST /api/posts —— 需要登录；作者取自令牌
  app.post('/api/posts', rateLimit('createPost'), async (req: Request, res: Response) => {
    const user = await currentUser(payload, req)
    if (!user) return fail(res, 401, 'unauthorized')

    const parsed = createPostSchema.safeParse(req.body)
    if (!parsed.success) {
      return fail(res, 400, 'validation_failed', parsed.error.issues[0]?.message)
    }
    try {
      const doc = await payload.create({
        collection: 'posts',
        data: {
          ...parsed.data,
          authorId: String(user.id),
          authorUsername: user.username,
        },
        overrideAccess: true,
      })
      ok(res, toPostContract(doc as unknown as Record<string, unknown>), 201)
    } catch (err: unknown) {
      // 上游原文只进日志（批次 6「响应体无堆栈」）：Payload/Drizzle 抛的 message 里
      // 常有 SQL 片段、绝对路径甚至半截堆栈，原样透传等于把内部实现交给客户端。
      console.error('[posts] create failed:', err)
      fail(res, 400, 'create_failed', '发布失败，请稍后重试')
    }
  })

  // PATCH /api/posts/:id —— 只能改自己的；404/403 区分
  app.patch('/api/posts/:id', async (req: Request, res: Response) => {
    const user = await currentUser(payload, req)
    if (!user) return fail(res, 401, 'unauthorized')

    const parsed = updatePostSchema.safeParse(req.body)
    if (!parsed.success) {
      return fail(res, 400, 'validation_failed', parsed.error.issues[0]?.message)
    }

    const id = String(req.params.id)
    try {
      const existing = await payload.findByID({
        collection: 'posts',
        id,
        disableErrors: true,
        overrideAccess: true,
      })
      // 「不存在 404」与「存在但非本人 403」必须区分（FR-POST-3）
      if (!existing) return fail(res, 404, 'not_found')
      if (String((existing as unknown as Record<string, unknown>).authorId) !== String(user.id)) {
        return fail(res, 403, 'forbidden')
      }

      // 过滤 undefined：客户端没传的字段绝不能被清空
      const patch = Object.fromEntries(
        Object.entries(parsed.data).filter(([, v]) => v !== undefined),
      )
      if (!Object.keys(patch).length) {
        return ok(res, toPostContract(existing as unknown as Record<string, unknown>))
      }

      const updated = await payload.update({
        collection: 'posts',
        id,
        data: patch,
        overrideAccess: true,
      })
      ok(res, toPostContract(updated as unknown as Record<string, unknown>))
    } catch {
      fail(res, UUID_RE.test(id) ? 500 : 404, UUID_RE.test(id) ? 'internal_error' : 'not_found')
    }
  })

  // DELETE /api/posts/:id —— 只能删自己的；204
  app.delete('/api/posts/:id', async (req: Request, res: Response) => {
    const user = await currentUser(payload, req)
    if (!user) return fail(res, 401, 'unauthorized')

    const id = String(req.params.id)
    try {
      const existing = await payload.findByID({
        collection: 'posts',
        id,
        disableErrors: true,
        overrideAccess: true,
      })
      if (!existing) return fail(res, 404, 'not_found')
      if (String((existing as unknown as Record<string, unknown>).authorId) !== String(user.id)) {
        return fail(res, 403, 'forbidden')
      }

      await payload.delete({ collection: 'posts', id, overrideAccess: true })
      res.status(204).end()
    } catch {
      fail(res, UUID_RE.test(id) ? 500 : 404, UUID_RE.test(id) ? 'internal_error' : 'not_found')
    }
  })
}
