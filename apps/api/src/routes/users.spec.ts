import type { Express, Request } from 'express'
import type { Payload } from 'payload'
import { PUBLIC_USER_KEYS, registerUserRoutes, toPublicUser } from './users.js'

/**
 * users 域的行为测试。
 *
 * 这一域只有一个 GET，**不解析请求体**（所以没有 schema 需要 `.strict()`），
 * 它承担的是 R-C 三道闸门的闸门 3：Payload 的 Local API 文档自带
 * hash / salt / loginAttempts，任何一条路径漏出这些字段就是认证材料泄漏。
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

/** 真实的 Payload 用户文档：内部字段一定在里面，映射层必须把它们挡掉 */
function payloadUserDoc() {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'dong@example.com',
    username: 'dong',
    avatarGradient: 2,
    bio: '写点东西',
    createdAt: '2026-01-01T00:00:00.000Z',
    hash: 'secret-hash',
    salt: 'secret-salt',
    loginAttempts: 3,
    lastLogin: '2026-01-02T00:00:00.000Z',
  }
}

describe('toPublicUser · 闸门 3（逐字段挑选，不是整体发送再删）', () => {
  it('只输出契约约定的字段，认证材料一个都不带', () => {
    const pub = toPublicUser(payloadUserDoc())
    expect(Object.keys(pub).every((k) => (PUBLIC_USER_KEYS as readonly string[]).includes(k))).toBe(
      true,
    )
    expect(JSON.stringify(pub)).not.toContain('secret-hash')
    expect(JSON.stringify(pub)).not.toContain('loginAttempts')
  })

  it('未登录过的用户也要能映射（avatarGradient 缺省回第一档）', () => {
    const pub = toPublicUser({ ...payloadUserDoc(), avatarGradient: undefined, bio: null })
    expect(pub.avatarColor).toBeTruthy()
    expect(pub.bio).toBeUndefined()
  })
})

describe('GET /api/users/:username · 落到响应上的行为', () => {
  function fakePayload(overrides: Record<string, unknown> = {}) {
    const finds: Array<Record<string, unknown>> = []
    const raw = {
      find: async (args: Record<string, unknown>) => {
        finds.push(args)
        return { docs: [payloadUserDoc()] }
      },
      ...overrides,
    }
    return { payload: raw as unknown as Payload, finds }
  }

  it('公开资料 200，且响应体里没有 hash/salt', async () => {
    const { app, route } = fakeApp()
    const { payload } = fakePayload()
    registerUserRoutes(app, payload)

    const res = await call(route('get /api/users/:username'), {}, { username: 'dong' })
    const body = JSON.stringify(res.body)

    expect(res.statusCode).toBe(200)
    expect(body).toContain('dong')
    expect(body).not.toContain('secret-hash')
    expect(body).not.toContain('secret-salt')
    expect(body).not.toMatch(/at [A-Za-z_$][\w$]*\(/)
  })

  it('body 传什么都不参与查询：where 只用路径参数', async () => {
    const { app, route } = fakeApp()
    const { payload, finds } = fakePayload()
    registerUserRoutes(app, payload)

    await call(
      route('get /api/users/:username'),
      { username: 'someone-else', role: 'admin' },
      { username: 'dong' },
    )

    expect(JSON.stringify(finds[0])).toContain('dong')
    expect(JSON.stringify(finds[0])).not.toContain('someone-else')
  })

  it('查不到就是 404，不回一张空用户', async () => {
    const { app, route } = fakeApp()
    const { payload } = fakePayload({ find: async () => ({ docs: [] }) })
    registerUserRoutes(app, payload)

    const res = await call(route('get /api/users/:username'), {}, { username: 'ghost' })

    expect(res.statusCode).toBe(404)
  })

  it('上游抛错只出 500，响应体里没有堆栈与 SQL', async () => {
    const { app, route } = fakeApp()
    const { payload } = fakePayload({
      find: async () => {
        throw Object.assign(
          new Error(
            'select * from "users" - relation users does not exist /app/apps/api/src/routes/users.ts',
          ),
          { stack: 'Error: at Payload.find (/app/node_modules/payload/dist/index.js:12:34)' },
        )
      },
    })
    registerUserRoutes(app, payload)

    const res = await call(route('get /api/users/:username'), {}, { username: 'dong' })
    const body = JSON.stringify(res.body)

    expect(res.statusCode).toBe(500)
    expect(body).not.toContain('select * from')
    expect(body).not.toContain('/app/')
    expect(body).not.toMatch(/at [A-Za-z_$][\w$]*\(/)
  })
})
