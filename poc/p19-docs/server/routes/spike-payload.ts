/**
 * Spike 路由：GET /spike-payload
 * 验证三件事：
 *   1. Payload 能在 Nitro 进程内 init（ESM / 依赖解析 / 数据库连接）
 *   2. Local API 能读写（create + find + count）
 *   3. auth 集合可用（payload.login 走的是 Payload 自己的认证，不是我们自研）
 */
import { getPayload } from 'payload'
import { spikeConfig } from '../utils/payload-spike.js'

export default defineEventHandler(async () => {
  const t0 = Date.now()
  const payload = await getPayload({ config: spikeConfig })
  const initMs = Date.now() - t0

  const email = `spike+${Date.now()}@example.com`
  const created = await payload.create({
    collection: 'users',
    data: { email, username: 'spike-user', password: 'spike-password' },
  })

  const found = await payload.find({ collection: 'users', where: { email: { equals: email } } })
  const count = await payload.count({ collection: 'users' })

  // auth 能力验证（Payload 内置）
  const login = await payload.login({
    collection: 'users',
    data: { email, password: 'spike-password' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)

  return {
    ok: true,
    initMs,
    createdId: created.id,
    foundCount: found.docs.length,
    totalCount: count.totalDocs,
    hasToken: Boolean(login?.token),
    // ⚠️ 关键：默认 find 是否会带出 passwordHash？（R-C 闸门 1 在 Payload 下的等价问题）
    leakedPasswordHash: 'passwordHash' in (found.docs[0] ?? {}),
    docKeys: Object.keys(found.docs[0] ?? {}).sort(),
  }
})
