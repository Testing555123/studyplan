import type { Express, Request } from 'express'
import type { Payload } from 'payload'
import { loginSchema, registerSchema, registerAuthRoutes } from './auth.js'

/**
 * auth 域的入参校验与错误映射测试（批次 6 验收：未知字段必须被拒、响应体无堆栈）。
 *
 * 替身思路与 posts.spec.ts 相同：不启动 Express、不连数据库，
 * 直接驱动注册出来的真实处理函数，断言落在状态码与响应体上。
 *
 * 这一域额外要守住的是：注册接口是**唯一**能建用户的入口，
 * 所以 body 里的 role / provider 一类字段必须被拒 —— 静默丢弃也算 bug，
 * 因为客户端会以为自己已经提权了。
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

/** 只跑业务处理函数，跳过快照里的限流中间件：理由与 posts.spec.ts 相同 */
async function call(handlers: Handler[], body: unknown) {
  const req = {
    body,
    params: {},
    query: {},
    headers: {},
    ip: '10.0.0.1',
  } as unknown as Request
  const res = fakeRes()
  await handlers[handlers.length - 1](req, res, () => {})
  return res
}

/** Payload 的 auth 集合替身：create 记账、login 发一张假 token */
function fakePayload(overrides: Record<string, unknown> = {}) {
  const created: Array<Record<string, unknown>> = []
  const raw = {
    auth: async () => ({ user: null }),
    create: async (args: { data: Record<string, unknown> }) => {
      created.push(args.data)
      return storedUser(args.data)
    },
    login: async () => ({ token: 'jwt.for.test', user: storedUser({}) }),
    ...overrides,
  }
  return { payload: raw as unknown as Payload, created }
}

function storedUser(data: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'dong@example.com',
    username: 'dong',
    avatarGradient: 3,
    bio: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...data,
  }
}

function validRegister() {
  return { email: 'Dong@Example.com ', username: ' dong ', password: 'password-123' }
}

/** 上游原文：驱动把 SQL、绝对路径、堆栈都塞在 message 里 */
const UPSTREAM_ERROR = Object.assign(
  new Error('insert into "users" … - duplicate table /app/apps/api/src/routes/auth.ts'),
  { stack: 'Error: at Payload.create (/app/node_modules/payload/dist/index.js:12:34)' },
)

describe('registerSchema · 注册的字段白名单', () => {
  it('合法 body 解析成功，并顺手 trim/小写化', () => {
    const parsed = registerSchema.safeParse(validRegister())
    expect(parsed.success).toBe(true)
    expect((parsed as { data: { email: string; username: string } }).data).toMatchObject({
      email: 'dong@example.com',
      username: 'dong',
    })
  })

  it('多传 role 要报错，而不是被静默丢掉后回一个 201', () => {
    expect(registerSchema.safeParse({ ...validRegister(), role: 'admin' }).success).toBe(false)
  })

  it('多传 authorId（旧 Mongo 时代的字段名）同样被拒', () => {
    expect(registerSchema.safeParse({ ...validRegister(), authorId: 'x' }).success).toBe(false)
  })
})

describe('loginSchema · 登录的字段白名单', () => {
  it('合法 body 解析成功', () => {
    expect(
      loginSchema.safeParse({ email: 'dong@example.com', password: 'password-123' }).success,
    ).toBe(true)
  })

  it('多传字段要报错（客户端拼错 body 不该被当成一次凭据尝试）', () => {
    expect(
      loginSchema.safeParse({ email: 'dong@example.com', password: 'x', remember: true }).success,
    ).toBe(false)
  })
})

describe('POST /api/auth/register · 落到响应上的行为', () => {
  it('多传 role 返回 400 且不建用户', async () => {
    const { app, route } = fakeApp()
    const { payload, created } = fakePayload()
    registerAuthRoutes(app, payload)

    const res = await call(route('post /api/auth/register'), {
      ...validRegister(),
      role: 'admin',
    })

    expect(res.statusCode).toBe(400)
    expect(created).toHaveLength(0)
  })

  it('干净 body 走 201 并拿到 token', async () => {
    const { app, route } = fakeApp()
    const { payload } = fakePayload()
    registerAuthRoutes(app, payload)

    const res = await call(route('post /api/auth/register'), validRegister())

    expect(res.statusCode).toBe(201)
    expect(JSON.stringify(res.body)).toContain('jwt.for.test')
  })

  it('上游抛错时响应体里没有堆栈与 SQL', async () => {
    const { app, route } = fakeApp()
    const { payload } = fakePayload({
      create: async () => {
        throw UPSTREAM_ERROR
      },
    })
    registerAuthRoutes(app, payload)

    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    const res = await call(route('post /api/auth/register'), validRegister())
    const body = JSON.stringify(res.body)
    log.mockRestore()

    expect(res.statusCode).toBe(400)
    expect(body).not.toContain('duplicate table')
    expect(body).not.toContain('/app/')
    expect(body).not.toMatch(/at [A-Za-z_$][\w$]*\(/)
  })

  it('被拒的明细留在服务端日志里', async () => {
    const { app, route } = fakeApp()
    const { payload } = fakePayload({
      create: async () => {
        throw UPSTREAM_ERROR
      },
    })
    registerAuthRoutes(app, payload)

    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    await call(route('post /api/auth/register'), validRegister())
    const loggedArgs = log.mock.calls[0]
    log.mockRestore()

    // Error 的 message/stack 不可枚举，JSON.stringify 会得到 {}，只能按字符串取明细
    expect(String(loggedArgs?.[0])).toContain('register')
    expect(String(loggedArgs?.[1])).toContain('duplicate table')
  })

  it('唯一冲突仍翻成 409，且响应体不含上游原文', async () => {
    const { app, route } = fakeApp()
    const { payload } = fakePayload({
      create: async () => {
        throw { data: { errors: [{ message: 'Value must be unique', path: 'email' }] } }
      },
    })
    registerAuthRoutes(app, payload)

    const res = await call(route('post /api/auth/register'), validRegister())

    expect(res.statusCode).toBe(409)
    expect(JSON.stringify(res.body)).not.toContain('Value must be unique')
  })
})

describe('POST /api/auth/login · 落到响应上的行为', () => {
  it('未知字段是客户端 bug，给 400 而不是「凭据无效」，且不碰数据库', async () => {
    const { app, route } = fakeApp()
    const login = jest.fn()
    const { payload } = fakePayload({ login })
    registerAuthRoutes(app, payload)

    const res = await call(route('post /api/auth/login'), {
      email: 'dong@example.com',
      password: 'password-123',
      remember: true,
    })

    expect(res.statusCode).toBe(400)
    expect(login).not.toHaveBeenCalled()
  })

  it('凭据本身有问题仍统一 401（刻意不区分邮箱是否存在，防账号枚举）', async () => {
    const { app, route } = fakeApp()
    const { payload } = fakePayload({
      login: async () => {
        throw new Error('The following environment is incorrect')
      },
    })
    registerAuthRoutes(app, payload)

    const res = await call(route('post /api/auth/login'), {
      email: 'dong@example.com',
      password: 'wrong-password',
    })

    expect(res.statusCode).toBe(401)
  })

  it('登录成功回 token，且响应体里没有 Payload 文档的内部字段', async () => {
    const { app, route } = fakeApp()
    const { payload } = fakePayload({
      login: async () => ({
        token: 'jwt.for.test',
        user: storedUser({ hash: 'h', salt: 's', loginAttempts: 2 }),
      }),
    })
    registerAuthRoutes(app, payload)

    const res = await call(route('post /api/auth/login'), {
      email: 'dong@example.com',
      password: 'password-123',
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.stringify(res.body)).not.toContain('loginAttempts')
    expect(JSON.stringify(res.body)).not.toMatch(/at [A-Za-z_$][\w$]*\(/)
  })
})
