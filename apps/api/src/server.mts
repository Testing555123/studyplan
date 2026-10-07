import express from 'express'
import { getPayload } from 'payload'
import { config } from './payload.config.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerUserRoutes } from './routes/users.js'
import { registerPostRoutes } from './routes/posts.js'
import { registerCommentRoutes } from './routes/comments.js'
import { registerLikeRoutes } from './routes/likes.js'

/**
 * 方案 A：Express 只做「HTTP ↔ Payload Local API」转接。
 * 认证、权限、CRUD、校验、迁移全部由 Payload 承担 —— 这里不自研其中任何一样。
 * 五个业务域（auth / users / posts / comments / likes）各自成文件，
 * 行为契约对齐旧的 NestJS 实现（批次 1③）。
 */

const app = express()
app.use(express.json({ limit: '1mb' }))

/**
 * ⚠️⚠️ 时序不可交换（PoC P2 实测）：
 *   Payload Config 【没有】 trustProxy 选项，所以必须在这里设置，
 *   而且必须在 getPayload() 之前。写晚 → req.ip 取不到反代后的真实 IP
 *   → 限流退化成「全站共用一个桶」。
 */
app.set('trust proxy', 1)

const payload = await getPayload({ config })

app.get('/api/health', async (_req, res) => {
  try {
    const count = await payload.count({ collection: 'users' })
    res.json({ data: { status: 'ok', users: count.totalDocs } })
  } catch {
    res.status(503).json({ error: { code: 'db_unavailable' } })
  }
})

registerAuthRoutes(app, payload)
registerUserRoutes(app, payload)
registerPostRoutes(app, payload)
registerCommentRoutes(app, payload)
registerLikeRoutes(app, payload)

const port = Number(process.env.PORT ?? 3000)
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[payload-api] listening on ${port}，trust proxy=1，限流已启用`)
})
