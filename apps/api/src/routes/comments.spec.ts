import type { Express, Request } from 'express'
import type { Payload } from 'payload'
import { COMMENT_MAX_LENGTH } from '@studyplan/shared'
import { createCommentSchema, registerCommentRoutes } from './comments.js'

/**
 * comments 域的入参校验与错误映射测试（批次 6 验收：未知字段必须被拒、响应体无堆栈）。
 *
 * 替身思路与 posts.spec.ts 相同：不启动 Express、不连数据库，直接驱动真实处理函数。
 * 这一域的未知字段尤其危险：`post` / `authorId` 都是路由自己注入的，
 * 客户端传进来必须报错，静默丢弃会让前端以为自己评论到了别的帖子上。
 */

type Handler = (req: unknown, res: unknown, next: () => void) => Promise<unknown> | unknown

function fakeApp() {
  const routes = new Map<string, Handler[]>()
  const forMethod =
    (method: string) =>
    (...args: unknown[]) => {
      const [path, ...handlers] = args as [string, ...Handler[]]
      routes.set(`${method} ${path}`, handlers)
    }
  const app = {
    get: forMethod('get'),
    post: forMethod('post'),
    patch: forMethod('patch'),
    put: forMethod('put'),
    delete: forMethod('delete'),
  } as unknown as Express
  return {
    app,
    route(key: string) {
      const handlers = routes.get(key)
      if (!handlers) throw new Error(`路由未注册：${key}`)
      return handlers
    },
  }
}

type FakeRes = {
  statusCode: number
  body: unknown
  ended: boolean
  status(code: number): FakeRes
  json(payload: unknown): FakeRes
  end(): FakeRes
}

function fakeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 0,
    body: undefined,
    ended: false,
    status(code) {
      res.statusCode = code
      return res
    },
    json(payload) {
      res.body = payload
      return res
    },
    end() {
      res.ended = true
      return res
    },
  }
  return res
}

async function call(handlers: Handler[], body: unknown, params: Record<string, string> = {}) {
  const req = {
    body,
    params,
    query: {},
    headers: {},
    ip: `10.0.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`,
  } as unknown as Request
  const res = fakeRes()
  for (const handler of handlers) await handler(req, res, () => {})
  return res
}

const TOKEN_USER = { id: '11111111-1111-1111-1111-111111111111', username: 'dong' }
const POST_ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
const COMMENT_ID = '3b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'

function storedComment(data: Record<string, unknown> = {}) {
  return {
    id: COMMENT_ID,
    post: POST_ID,
    content: '写得清楚',
    authorId: TOKEN_USER.id,
    authorUsername: TOKEN_USER.username,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...data,
  }
}

/** comments 域用到的 Local API 调用：auth / findByID（存在性与归属）/ create / 原生 execute（计数） */
function fakePayload(overrides: Record<string, unknown> = {}) {
  const created: Array<Record<string, unknown>> = []
  const raw = {
    auth: async () => ({ user: TOKEN_USER }),
    findByID: async () => ({ id: POST_ID }),
    find: async () => ({ docs: [] }),
    create: async (args: { data: Record<string, unknown> }) => {
      created.push(args.data)
      return storedComment(args.data)
    },
    delete: async () => storedComment(),
    db: { drizzle: { execute: async () => ({ rows: [{ comment_count: 1 }] }) } },
    ...overrides,
  }
  return { payload: raw as unknown as Payload, created }
}

/** 上游原文：驱动/ORM 会把 SQL、绝对路径都写进 message */
const UPSTREAM_ERROR = Object.assign(
  new Error(
    'insert into "comments" … - relation comments already exists /app/apps/api/src/routes/comments.ts',
  ),
  { stack: 'Error: at Payload.create (/app/node_modules/payload/dist/index.js:12:34)' },
)

describe('createCommentSchema · 请求体白名单', () => {
  it('合法 body 解析成功', () => {
    expect(createCommentSchema.safeParse({ content: '写得清楚' }).success).toBe(true)
  })

  it('多传 authorId 要报错，而不是被静默丢掉', () => {
    expect(createCommentSchema.safeParse({ content: '写得清楚', authorId: 'x' }).success).toBe(
      false,
    )
  })

  it('多传 post 要报错（挂到哪篇帖子只能由路径决定）', () => {
    expect(createCommentSchema.safeParse({ content: '写得清楚', post: POST_ID }).success).toBe(
      false,
    )
  })

  it('空内容与超长内容仍然被拒（保留原有校验）', () => {
    expect(createCommentSchema.safeParse({ content: '   ' }).success).toBe(false)
    expect(
      createCommentSchema.safeParse({ content: 'x'.repeat(COMMENT_MAX_LENGTH + 1) }).success,
    ).toBe(false)
  })
})

describe('POST /api/posts/:postId/comments · 落到响应上的行为', () => {
  it('多传 authorId 返回 400，且根本不写库', async () => {
    const { app, route } = fakeApp()
    const { payload, created } = fakePayload()
    registerCommentRoutes(app, payload)

    const res = await call(
      route('post /api/posts/:postId/comments'),
      { content: '写得清楚', authorId: '22222222-2222-2222-2222-222222222222' },
      { postId: POST_ID },
    )

    expect(res.statusCode).toBe(400)
    expect(created).toHaveLength(0)
  })

  it('干净 body 走 201，作者与帖子都由路由自己注入', async () => {
    const { app, route } = fakeApp()
    const { payload, created } = fakePayload()
    registerCommentRoutes(app, payload)

    const res = await call(
      route('post /api/posts/:postId/comments'),
      { content: '写得清楚' },
      { postId: POST_ID },
    )

    expect(res.statusCode).toBe(201)
    expect(created[0]).toMatchObject({ post: POST_ID, authorId: TOKEN_USER.id })
  })

  it('未登录时先 401，不会走到写库', async () => {
    const { app, route } = fakeApp()
    const { payload, created } = fakePayload({ auth: async () => ({ user: null }) })
    registerCommentRoutes(app, payload)

    const res = await call(
      route('post /api/posts/:postId/comments'),
      { content: '写得清楚' },
      { postId: POST_ID },
    )

    expect(res.statusCode).toBe(401)
    expect(created).toHaveLength(0)
  })

  it('上游抛错时响应体里没有堆栈与 SQL', async () => {
    const { app, route } = fakeApp()
    const { payload } = fakePayload({
      create: async () => {
        throw UPSTREAM_ERROR
      },
    })
    registerCommentRoutes(app, payload)

    const res = await call(
      route('post /api/posts/:postId/comments'),
      { content: '写得清楚' },
      { postId: POST_ID },
    )
    const body = JSON.stringify(res.body)

    expect(res.statusCode).toBe(500)
    expect(body).not.toContain('already exists')
    expect(body).not.toContain('/app/')
    expect(body).not.toMatch(/at [A-Za-z_$][\w$]*\(/)
  })
})
