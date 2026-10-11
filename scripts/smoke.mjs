/**
 * 统一冒烟脚本（T16 / V6）。
 * 对 BASE_URL 命中与本地/容器同一组端点：/api/health（形态，对 DB 可用性宽容）、
 * 首页、/ebook、/ai（可达）。本地与容器复用本脚本，满足「容器 smoke 与本地 smoke 命中相同端点」。
 *
 * 用法：
 *   BASE_URL=http://localhost:3000 SMOKE_RETRIES=30 node scripts/smoke.mjs
 */
function cfg() {
  return {
    baseUrl: (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
    retries: Number(process.env.SMOKE_RETRIES ?? 30),
    delay: Number(process.env.SMOKE_DELAY_MS ?? 2000),
  }
}

async function fetchWithRetry(url, { retries, delay }) {
  let lastErr
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(url)
      return res
    } catch (err) {
      lastErr = err
      if (i < retries) await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastErr ?? new Error('fetch failed')
}

async function checkHealth({ baseUrl, retries, delay }) {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(`${baseUrl}/api/health`)
      if (res.status === 200 || res.status === 503) {
        const body = await res.json()
        if (['ok', 'degraded'].includes(body.status) && ['connected', 'disconnected'].includes(body.database)) {
          return body
        }
      }
    } catch {
      /* 重试 */
    }
    if (i < retries) await new Promise((r) => setTimeout(r, delay))
  }
  throw new Error(`/api/health 在 ${retries} 次重试后仍不可达或形态不符`)
}

async function checkReachable(path, { baseUrl, retries, delay }) {
  const res = await fetchWithRetry(`${baseUrl}${path}`, { retries, delay })
  if (res.status >= 400) {
    throw new Error(`${path} 返回 ${res.status}`)
  }
  return res.status
}

export async function runSmoke(options = {}) {
  const c = { ...cfg(), ...options }
  const health = await checkHealth(c)
  const home = await checkReachable('/', c)
  const ebook = await checkReachable('/ebook', c)
  const ai = await checkReachable('/ai', c)
  const result = { health, home, ebook, ai }
  console.log(
    `[smoke] health=${health.status}/${health.database} home=${home} ebook=${ebook} ai=${ai} @ ${c.baseUrl}`,
  )
  return result
}

// CLI 入口
if (import.meta.url === `file://${process.argv[1]}`) {
  runSmoke()
    .then(() => {
      console.log('[smoke] OK')
      process.exit(0)
    })
    .catch((err) => {
      console.error('[smoke] FAIL:', err.message)
      process.exit(1)
    })
}
