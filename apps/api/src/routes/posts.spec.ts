import type { Express, Request } from 'express'
import type { Payload } from 'payload'
import { CONTENT_MIN_LENGTH, POST_TAGS } from '@studyplan/shared'
import { createPostSchema, registerPostRoutes, updatePostSchema } from './posts.js'

/**
 * posts 域的入参校验与错误映射测试（批次 6 验收：多传 authorId 返回 400、响应体无堆栈）。
 *
 * 不启动 Express、不连数据库：`registerPostRoutes` 只要 app 有注册方法、payload 有本文
 * 用到的那几个 Local API 调用就能跑，所以给它俩各造一个内存替身，直接驱动真实处理函数。
 * 断言落在**状态码与响应体**上（真实行为），替身只负责「照实抛错 / 照实记账」。
 */

type Handler = (req: unknown, res: unknown, next: () => void) => Promise<unknown> | unknown

/** 把注册过的路由按「方法 路径」收下来，一个 socket 都不 listen */
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

/**
 * 只跑链上最后一个处理函数：限流是批次 5 的中间件，与本文要验的入参校验/错误映射无关，
 * 而 RateLimiterMemory 的清理定时器会让 jest worker 退不干净
 * （多 suite 并行时报 "A worker process has failed to exit gracefully"，白噪音）。
 */
async function call(handlers: Handler[], body: unknown, params: Record<string, string> = {}) {
  const req = {
    body,
    params,
    query: {},
    headers: {},
    ip: '10.0.0.1',
  } as unknown as Request
  const res = fakeRes()
  await handlers[handlers.length - 1](req, res, () => {})
  return res
}

const TOKEN_USER = { id: '11111111-1111-1111-1111-111111111111', username: 'dong' }

/** 库里读出来的帖子要够 toPostContract 逐字段挑，缺一个就变成 TypeError 假失败 */
function storedPost(data: Record<string, unknown> = {}) {
  return {
    id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    title: '批次 6 的验收',
    content: 'x'.repeat(CONTENT_MIN_LENGTH),
    tags: [POST_TAGS[0]],
    summary: null,
    authorId: TOKEN_USER.id,
    authorUsername: TOKEN_USER.username,
    likeCount: 0,
    commentCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...data,
  }
}

/** Payload Local API 替身：create/update 记账，并回一张按收到的 data 拼出的文档 */
function fakePayload(overrides: Record<string, unknown> = {}) {
  const written: Array<Record<string, unknown>> = []
  const raw = {
    auth: async () => ({ user: TOKEN_USER }),
    create: async (args: { data: Record<string, unknown> }) => {
      written.push(args.data)
      return storedPost(args.data)
    },
    update: async (args: { data: Record<string, unknown> }) => {
      written.push(args.data)
      return storedPost(args.data)
    },
    findByID: async () => null,
    find: async () => ({ docs: [], totalDocs: 0 }),
    db: { drizzle: { execute: async () => ({ rows: [] }) } },
    ...overrides,
  }
  return { payload: raw as unknown as Payload, written }
}

function validBody() {
  return {
    title: '批次 6 的验收',
    content: 'x'.repeat(CONTENT_MIN_LENGTH),
    tags: [POST_TAGS[0]],
  }
}

/** 上游原文就长这样：SQL 片段 + 绝对路径 + 半截堆栈，一个字符都不许进响应体 */
const UPSTREAM_ERROR = Object.assign(
  new Error(
    'insert into "posts" ("title", "author_id") values ($1, $2) - duplicate table /app/apps/api/src/routes/posts.ts',
  ),
  { stack: 'Error: at Payload.create (/app/node_modules/payload/dist/index.js:12:34)' },
)

describe('createPostSchema · POST 的字段白名单', () => {
  it('合法 body 解析成功', () => {
    expect(createPostSchema.safeParse(validBody()).success).toBe(true)
  })

  it('多传 authorId 要报错，而不是被静默丢掉后当合法请求放行', () => {
    expect(createPostSchema.safeParse({ ...validBody(), authorId: '2' }).success).toBe(false)
  })

  it('未知字段给出 unrecognized_keys，客户端拼错 body 才有的诊断', () => {
    const parsed = createPostSchema.safeParse({ ...validBody(), role: 'admin' })
    expect(parsed.success).toBe(false)
    const issues = (parsed as { error?: { issues: Array<{ code: string }> } }).error?.issues
    expect(issues?.[0]?.code).toBe('unrecognized_keys')
  })
})

describe('updatePostSchema · PATCH 的字段白名单', () => {
  it('PATCH 允许只传部分字段', () => {
    expect(updatePostSchema.safeParse({ title: '只改标题' }).success).toBe(true)
  })

  it('PATCH 多传 authorId 同样被拒（换作者不是改出来的）', () => {
    expect(updatePostSchema.safeParse({ title: '只改标题', authorId: 'x' }).success).toBe(false)
  })
})

describe('POST /api/posts · 落到响应上的行为', () => {
  it('多传 authorId 返回 400，且根本不写库', async () => {
    const { app, route } = fakeApp()
    const { payload, written } = fakePayload()
    registerPostRoutes(app, payload)

    const res = await call(route('post /api/posts'), {
      ...validBody(),
      authorId: '33333333-3333-3333-3333-333333333333',
    })

    expect(res.statusCode).toBe(400)
    expect(written).toHaveLength(0)
  })

  it('干净 body 仍走 201，作者取自令牌而不是请求体', async () => {
    const { app, route } = fakeApp()
    const { payload, written } = fakePayload()
    registerPostRoutes(app, payload)

    const res = await call(route('post /api/posts'), validBody())

    expect(res.statusCode).toBe(201)
    expect(written[0]).toMatchObject({ authorId: TOKEN_USER.id })
  })

  it('上游抛错时响应体里没有堆栈、SQL 与路径（批次 6「响应体无堆栈」）', async () => {
    const { app, route } = fakeApp()
    const { payload } = fakePayload({
      create: async () => {
        throw UPSTREAM_ERROR
      },
    })
    registerPostRoutes(app, payload)

    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    const res = await call(route('post /api/posts'), validBody())
    const body = JSON.stringify(res.body)
    log.mockRestore()

    expect(res.statusCode).toBe(400)
    expect(body).not.toContain('duplicate table')
    expect(body).not.toContain('/app/')
    expect(body).not.toContain('insert into')
    expect(body).not.toMatch(/at [A-Za-z_$][\w$]*\(/)
  })

  it('被拒的明细留在服务端日志里，否则线上无从排查', async () => {
    const { app, route } = fakeApp()
    const { payload } = fakePayload({
      create: async () => {
        throw UPSTREAM_ERROR
      },
    })
    registerPostRoutes(app, payload)

    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    await call(route('post /api/posts'), validBody())
    const loggedArgs = log.mock.calls[0]
    log.mockRestore()

    // Error 的 message/stack 不可枚举，JSON.stringify 会得到 {}，只能按字符串取明细
    expect(String(loggedArgs?.[0])).toContain('create')
    expect(String(loggedArgs?.[1])).toContain('duplicate table')
  })
})

describe('PATCH /api/posts/:id · 落到响应上的行为', () => {
  it('多传 authorId 直接 400，不给「以为改了作者」留机会', async () => {
    const { app, route } = fakeApp()
    const { payload, written } = fakePayload({ findByID: async () => storedPost() })
    registerPostRoutes(app, payload)

    const res = await call(route('patch /api/posts/:id'), { title: '新标题', authorId: 'x' })

    expect(res.statusCode).toBe(400)
    expect(written).toHaveLength(0)
  })
})
