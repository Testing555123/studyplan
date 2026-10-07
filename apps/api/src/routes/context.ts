import type { Request, Response } from 'express'
import { sql } from 'drizzle-orm'
import type { Payload } from 'payload'
import type { Post as PostContract, Comment as CommentContract } from '@studyplan/shared'

/**
 * 五个业务域路由的共用助手。
 * Express 只做「HTTP ↔ Payload Local API」转接（方案 A），
 * 这里只放转接层需要的东西，不放任何业务规则。
 */

export const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ data })
export const fail = (
  res: Response,
  status: number,
  code: string,
  message?: string,
) => res.status(status).json({ error: { code, message } })

/** Payload 的 Local API 在字段校验失败时把明细放在 data.errors（ValidationError 用 path 标字段） */
export function uniqueFieldOf(err: unknown): string | null {
  const e = err as { data?: { errors?: Array<{ path?: string; field?: string }> } }
  const errors = e?.data?.errors
  if (!Array.isArray(errors)) return null
  for (const item of errors) {
    if (typeof item?.path === 'string') return item.path
    if (typeof item?.field === 'string') return item.field
  }
  return null
}

/**
 * 唯一冲突判定。两种形态都要接住：
 *   1. 字段级 unique → Payload ValidationError（data.errors[].message = "Value must be unique"）；
 *   2. 复合索引 unique → Drizzle/PG 的 23505（包在 cause/original 里）。
 */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as {
    data?: { errors?: Array<{ message?: string }> }
    code?: string
    original?: { code?: string }
    cause?: { code?: string }
    message?: string
  }
  if (e?.data?.errors?.some((it) => /unique/i.test(it?.message ?? ''))) return true
  return (
    e?.code === '23505' ||
    e?.original?.code === '23505' ||
    e?.cause?.code === '23505' ||
    /duplicate key value/i.test(e?.message ?? '')
  )
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 身份只来自令牌（不可违反项 4）。
 * ⚠️ payload.auth() 要求 Web Headers 实例（内部调 headers.get），
 *    直接传 express 的 req.headers（普通对象）会抛
 *    "headers.get is not a function" —— 必须先包一层 new Headers(...)。
 */
export async function currentUser(payload: Payload, req: Request) {
  try {
    const result = await payload.auth({
      headers: new Headers(req.headers as Record<string, string>),
    })
    return result.user ?? null
  } catch {
    return null
  }
}

/**
 * 原子调整帖子的计数字段（点赞数 / 评论数）。
 *
 * 换库后等价于原 Mongoose 的聚合管道 `$max: [0, {$add: [...]}}]`：
 *   - 由数据库做加法（不给"读→改→写"留并发窗口，保证不丢更新）；
 *   - GREATEST(0, …) 兜底，取消点赞永远不会减出负数。
 *
 * 这里绕过 Payload update 直接走 payload.db.drizzle（与批次 4 的检索同通道）：
 * Payload 的 update 语义是"整对象赋值"，没有自增操作符，
 * 任何 read-modify-write 都会重新引入丢更新问题。
 *
 * @returns 调整后的计数；帖子不存在时返回 null
 */
export async function adjustPostCounter(
  payload: Payload,
  postId: string,
  field: 'like_count' | 'comment_count',
  delta: 1 | -1,
): Promise<number | null> {
  if (!UUID_RE.test(postId)) return null
  const result = (await payload.db.drizzle.execute(
    sql`UPDATE posts SET ${sql.raw(field)} = GREATEST(0, ${sql.raw(field)} + ${delta})
        WHERE id = ${postId} RETURNING ${sql.raw(field)}`,
  )) as unknown as { rows?: Array<Record<string, unknown>> }
  const rows = result?.rows ?? []
  if (!rows.length) return null
  const value = rows[0][field]
  return value == null ? null : Number(value)
}

/** 帖子计数只读（供点赞的幂等回读） */
export async function getPostCounters(
  payload: Payload,
  postId: string,
): Promise<{ likeCount: number; commentCount: number } | null> {
  if (!UUID_RE.test(postId)) return null
  const result = (await payload.db.drizzle.execute(
    sql`SELECT like_count, comment_count FROM posts WHERE id = ${postId}`,
  )) as unknown as { rows?: Array<Record<string, unknown>> }
  const rows = result?.rows ?? []
  if (!rows.length) return null
  return {
    likeCount: Number(rows[0].like_count ?? 0),
    commentCount: Number(rows[0].comment_count ?? 0),
  }
}

/** 判断帖子是否存在（非法 uuid 直接 false，不让 PG 抛 invalid input syntax） */
export async function postExists(payload: Payload, postId: string): Promise<boolean> {
  if (!UUID_RE.test(postId)) return false
  const doc = await payload.findByID({
    collection: 'posts',
    id: postId,
    disableErrors: true,
    overrideAccess: true,
  })
  return Boolean(doc)
}

// ---------------------------------------------------------------------------
// 数据库形状 → 接口契约形状（显式逐字段挑选：默认不发送，要发就明确写出来）
// ---------------------------------------------------------------------------

/** posts 集合文档 → Post 契约。嵌入的 author 快照字段映射回 author 对象 */
export function toPostContract(doc: Record<string, unknown>): PostContract {
  return {
    id: String(doc.id),
    title: String(doc.title),
    content: String(doc.content),
    tags: Array.isArray(doc.tags) ? (doc.tags as string[]) : [],
    summary: (doc.summary as string | null) ?? undefined,
    aiTags: undefined,
    author: {
      id: String(doc.authorId),
      username: String(doc.authorUsername),
    },
    likeCount: Number(doc.likeCount ?? 0),
    commentCount: Number(doc.commentCount ?? 0),
    createdAt: new Date(doc.createdAt as string).toISOString(),
  }
}

/**
 * relationship 字段取 id：Local API 返回的文档里关系是**填充对象**或 id，
 * 直接 String() 会得到 "[object Object]"。
 */
export function relId(value: unknown): string {
  if (value && typeof value === 'object') return String((value as Record<string, unknown>).id)
  return String(value)
}

/** comments 集合文档 → Comment 契约 */
export function toCommentContract(doc: Record<string, unknown>): CommentContract {
  return {
    id: String(doc.id),
    postId: relId(doc.post),
    content: String(doc.content),
    author: {
      id: String(doc.authorId),
      username: String(doc.authorUsername),
    },
    createdAt: new Date(doc.createdAt as string).toISOString(),
  }
}
