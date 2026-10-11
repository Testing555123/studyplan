/**
 * 容器内/对容器实例的冒烟（T16 / V6）。
 * 复用 scripts/smoke.mjs 的同一套端点校验，仅把默认端点与重试窗口调成容器场景：
 * 容器启动到就绪通常需要更长时间，故默认重试更久、间隔更大。
 *
 * 用法（容器内或 CI 对容器地址）：
 *   BASE_URL=http://localhost:3000 node scripts/smoke-container.mjs
 *   APP_PORT=7860 node scripts/smoke-container.mjs   # HF Spaces 形态（容器监听 7860）
 */
// 端口可参数化：默认 3000（本地 compose），Space 形态为 7860（亦可直接传 BASE_URL 覆盖）。
const APP_PORT = process.env.APP_PORT ?? process.env.PORT ?? '3000'
process.env.BASE_URL = process.env.BASE_URL ?? `http://localhost:${APP_PORT}`
process.env.SMOKE_RETRIES = process.env.SMOKE_RETRIES ?? '60'
process.env.SMOKE_DELAY_MS = process.env.SMOKE_DELAY_MS ?? '3000'

const { runSmoke } = await import('./smoke.mjs')

runSmoke()
  .then(() => {
    console.log('[smoke-container] OK')
    process.exit(0)
  })
  .catch((err) => {
    console.error('[smoke-container] FAIL:', err.message)
    process.exit(1)
  })
