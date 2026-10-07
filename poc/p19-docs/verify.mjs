/**
 * P19 端到端验证脚本
 * ------------------------------------------------------------------
 * 构建产物起服务后，逐条核对 P19 的验收标准：
 *   1. 30 篇全部可达（30 个 md，其中 index.md 排除 → 29 个内容路由）
 *   2. **SSR 首屏含正文**（不是客户端 hydration 之后才有）
 *   3. stages/stage-N 与 exercises/stage-N 同名不同前缀，互不吞掉
 *   4. 旧路径 301 到新路径，且新路径自身不再被重定向（不成环）
 *
 * 用法：node verify.mjs
 */

import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = Number(process.env.PORT ?? 3009)
const BASE = `http://127.0.0.1:${PORT}`

const groups = {
  guide: [
    'roadmap',
    'project-structure',
    'environment',
    'git-workflow',
    'deployment-lessons',
    'debugging-lessons',
    'integration-lessons',
    'daily-digest',
  ],
  stages: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `stage-${n}`),
  exercises: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `stage-${n}`),
  design: [
    '01-visual-style-analysis',
    '02-design-system-recommendations',
    '03-issues-and-fixes',
    '04-modification-plan',
    'brand',
  ],
}

const contentPaths = [
  ...groups.guide.map((s) => `/ebook/guide/${s}`),
  ...groups.stages.map((s) => `/ebook/stages/${s}`),
  ...groups.exercises.map((s) => `/ebook/exercises/${s}`),
  ...groups.design.map((s) => `/ebook/design/${s}`),
]

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(BASE + '/', { redirect: 'manual' })
      return r
    } catch {
      await sleep(500)
    }
  }
  throw new Error('server did not start in time')
}

const server = spawn(process.execPath, ['.output/server/index.mjs'], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
server.stdout.on('data', (d) => (serverLog += d.toString()))
server.stderr.on('data', (d) => (serverLog += d.toString()))

try {
  const idx = await waitForServer()
  const idxHtml = await idx.text()

  // 1. 首页索引页：应报告 29 篇内容（30 个 md 减去 index.md）
  const totalMatch = idxHtml.match(/共\s*(\d+)\s*篇/)
  const total = totalMatch ? Number(totalMatch[1]) : -1
  record('① 内容篇数 = 29（30 篇 md 减去 index.md）', total === 29, `实际 ${total}`)

  // 2. 5 组导航都存在且非空
  for (const g of ['开始之前', '阶段正文', '经验档案', '设计', '规划练习']) {
    record(`② 导航分组「${g}」存在`, idxHtml.includes(g))
  }

  // 3. 全部 29 个内容路由 200 + SSR 首屏含正文
  let ok200 = 0
  const failures = []
  for (const p of contentPaths) {
    const r = await fetch(BASE + p, { redirect: 'manual' })
    const html = r.ok ? await r.text() : ''
    const hasH1 = /<h1[^>]*>/.test(html)
    if (r.status === 200 && hasH1) ok200 += 1
    else failures.push(`${p}(${r.status}${r.status === 200 ? ',无h1' : ''})`)
  }
  record(`③ 29 条内容路由均 200 且 SSR 首屏含 <h1>`, ok200 === contentPaths.length, failures.join(', '))
  record(`③b 内容路由总数 = 29`, contentPaths.length === 29, `实际 ${contentPaths.length}`)

  // 4. 同名不同前缀互不吞掉
  const s1 = await (await fetch(BASE + '/ebook/stages/stage-1')).text()
  const e1 = await (await fetch(BASE + '/ebook/exercises/stage-1')).text()
  record('④ stages/stage-1 是阶段正文', s1.includes('工程地基与 TypeScript 起步'))
  record('④ exercises/stage-1 是规划练习（未被 stages 吞掉）', e1.includes('规划练习 1'))

  // 5. 旧路径 301 → 新路径
  for (const [oldPath, expected] of [
    ['/stages/stage-1', '/ebook/stages/stage-1'],
    ['/exercises/stage-3', '/ebook/exercises/stage-3'],
    ['/design/brand', '/ebook/design/brand'],
    ['/guide/roadmap', '/ebook/guide/roadmap'],
  ]) {
    const r = await fetch(BASE + oldPath, { redirect: 'manual' })
    const loc = r.headers.get('location') ?? ''
    record(`⑤ 旧路径 ${oldPath} → 301 ${expected}`, r.status === 301 && loc === expected, `status=${r.status} loc=${loc}`)
  }

  // 6. 新路径自身不再被重定向（不成环）
  let cycles = 0
  for (const p of ['/ebook/stages/stage-1', '/ebook/exercises/stage-1', '/ebook/design/brand']) {
    const r = await fetch(BASE + p, { redirect: 'manual' })
    if (r.status !== 200) cycles += 1
  }
  record('⑥ 新路径不被重定向（无自环）', cycles === 0, `非 200 的新路径数=${cycles}`)

  // 7. 重定向链只有一跳
  let hop = 0
  let target = '/stages/stage-1'
  for (let i = 0; i < 5; i += 1) {
    const r = await fetch(BASE + target, { redirect: 'manual' })
    if (r.status !== 301) break
    target = r.headers.get('location')
    hop += 1
  }
  record('⑦ 重定向链只有一跳（不成环）', hop === 1, `跳数=${hop}`)
} catch (err) {
  record('运行期异常', false, String(err?.message ?? err))
  console.log('--- server log ---\n' + serverLog)
} finally {
  server.kill('SIGTERM')
}

const failed = results.filter((r) => !r.ok)
console.log(`\n合计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
process.exit(failed.length === 0 ? 0 : 1)
