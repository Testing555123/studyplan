import type { Express, Request } from 'express'
import type { Payload } from 'payload'
import { registerLikeRoutes } from './likes.js'

/**
 * likes 域的行为测试。
 *
 * 这一域**不解析请求体**（PUT/DELETE 的语义全在路径与令牌里），所以没有 schema 可以
 * `.strict()`；但正因如此更要锁死一件事：body 里出现 `user` / `postId` 这类字段时，
 * 既不能被采信、也不能被「静默丢弃后照常成功」—— 路由压根不读 body，
 * 写库的数据只来自令牌和路径。这里用真实处理函数把这条不变量钉住。
 *
 * 替身思路与 posts.spec.ts 相同：不启动 Express、不连数据库。
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
const OTHER_USER = '22222222-2222-2222-2222-222222222222'

/** likes 域用到的调用：auth / find（取已有那行）/ create / delete / 原生 execute（计数） */
function fakePayload(overrides: Record<string, unknown> = {}) {
  const writes: Array<Record<string, unknown>> = []
  const finds: Array<Record<string, unknown>> = []
  const raw = {
    auth: async () => ({ user: TOKEN_USER }),
    findByID: async () => ({ id: POST_ID }),
    find: async (args: Record<string, unknown>) => {
      finds.push(args)
      return { docs: [] }
    },
    create: async (args: { data: Record<string, unknown> }) => {
      writes.push(args.data)
      return { id: '5b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', ...args.data }
    },
    delete: async () => ({}),
    db: { drizzle: { execute: async () => ({ rows: [{ like_count: 1 }] }) } },
    ...overrides,
  }
  return { payload: raw as unknown as Payload, writes, finds }
}

/** 上游原文：唯一索引之外的驱动错误照样带 SQL 与路径 */
const UPSTREAM_ERROR = Object.assign(
  new Error(
    'insert into "likes" … - constraint "likes_post_user_id_idx" does not exist /app/apps/api/src/routes/likes.ts',
  ),
  { stack: 'Error: at Payload.create (/app/node_modules/payload/dist/index.js:12:34)' },
)

describe('PUT /api/posts/:postId/like · 身份只来自令牌', () => {
  it('body 里塞 user/postId 不会被采信：写库的是令牌身份 + 路径帖子', async () => {
    const { app, route } = fakeApp()
    const { payload, writes } = fakePayload()
    registerLikeRoutes(app, payload)

    const res = await call(
      route('put /api/posts/:postId/like'),
      { user: OTHER_USER, postId: OTHER_USER },
      { postId: POST_ID },
    )

    expect(res.statusCode).toBe(200)
    expect(writes).toHaveLength(1)
    expect(writes[0]).toEqual({ post: POST_ID, user: TOKEN_USER.id })
  })

  it('未登录时 body 里的 user 更不可能替代令牌', async () => {
    const { app, route } = fakeApp()
    const { payload, writes } = fakePayload({ auth: async () => ({ user: null }) })
    registerLikeRoutes(app, payload)

    const res = await call(
      route('put /api/posts/:postId/like'),
      { user: OTHER_USER },
      { postId: POST_ID },
    )

    expect(res.statusCode).toBe(401)
    expect(writes).toHaveLength(0)
  })

  it('非 uuid 的 postId 直接 404，不给 PG 抛 invalid input syntax 的机会', async () => {
    const { app, route } = fakeApp()
    const { payload, writes } = fakePayload()
    registerLikeRoutes(app, payload)

    const res = await call(route('put /api/posts/:postId/like'), {}, { postId: 'not-a-uuid' })

    expect(res.statusCode).toBe(404)
    expect(writes).toHaveLength(0)
  })

  it('重复点赞（PG 23505）算幂等成功，不是错误', async () => {
    const { app, route } = fakeApp()
    const { payload } = fakePayload({
      create: async () => {
        throw { code: '23505' }
      },
    })
    registerLikeRoutes(app, payload)

    const res = await call(route('put /api/posts/:postId/like'), {}, { postId: POST_ID })
    const body = JSON.stringify(res.body)

    expect(res.statusCode).toBe(200)
    expect(body).toContain('true')
    expect(body).not.toMatch(/at [A-Za-z_$][\w$]*\(/)
    expect(body).not.toContain('likes_post_user_id_idx')
  })

  it('其他上游错误只出 500，响应体里没有堆栈与 SQL', async () => {
    const { app, route } = fakeApp()
    const { payload } = fakePayload({
      create: async () => {
        throw UPSTREAM_ERROR
      },
    })
    registerLikeRoutes(app, payload)

    const res = await call(route('put /api/posts/:postId/like'), {}, { postId: POST_ID })
    const body = JSON.stringify(res.body)

    expect(res.statusCode).toBe(500)
    expect(body).not.toContain('does not exist')
    expect(body).not.toContain('/app/')
    expect(body).not.toMatch(/at [A-Za-z_$][\w$]*\(/)
  })
})

describe('DELETE /api/posts/:postId/like · 取消点赞', () => {
  it('查询条件由路径与令牌拼出，body 不参与', async () => {
    const { app, route } = fakeApp()
    const { payload, finds } = fakePayload()
    registerLikeRoutes(app, payload)

    const res = await call(
      route('delete /api/posts/:postId/like'),
      { user: OTHER_USER },
      { postId: POST_ID },
    )

    expect(res.statusCode).toBe(200)
    expect(JSON.stringify(finds[0])).toContain(TOKEN_USER.id)
    expect(JSON.stringify(finds[0])).not.toContain(OTHER_USER)
  })

  it('没赞过也返回成功（幂等），且不带任何内部细节', async () => {
    const { app, route } = fakeApp()
    const { payload } = fakePayload()
    registerLikeRoutes(app, payload)

    const res = await call(route('delete /api/posts/:postId/like'), {}, { postId: POST_ID })

    expect(res.statusCode).toBe(200)
    expect(JSON.stringify(res.body)).not.toMatch(/at [A-Za-z_$][\w$]*\(/)
  })
})
