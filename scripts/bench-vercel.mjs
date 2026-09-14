#!/usr/bin/env node
/**
 * Vercel 线上响应耗时量测脚本。
 * ═══════════════════════════════════════════════════════════
 *
 * ── 它解决什么问题 ──
 * "线上很慢"是没法优化的，只有"某个路径的 TTFB 是 1.9 秒"才能优化。
 * 这个脚本把一次请求拆成 DNS / TCP / TLS / TTFB / 总耗时 五段，
 * 让你能一眼看出时间花在哪：**握手慢是网络，TTFB 慢是应用，
 * total 远大于 TTFB 是传输体积。**
 *
 * ── 为什么不用 curl -w ──
 * curl 能用，但它有三个问题：
 *   1. 分段含义要查文档才知道（`time_appconnect` 是什么？）；
 *   2. 结果是一行长串，改一次要复制粘贴一次，没法留下可复现的基线；
 *   3. 冷启动要"先闲置 N 秒再打第一个请求"，用 curl 拼很难读。
 * 脚本化之后，`node scripts/bench-vercel.mjs` 一条命令拿到同一组数字，
 * 改动前后直接对比 —— 这才是"优化"能被验证的前提。
 *
 * ── 为什么零依赖 ──
 * 与 `docker/vercel/entrypoint.mjs` 保持同一约定：只用 Node 内置模块。
 * 这个仓库里"能在任何地方跑起来"比"写得省事"重要 ——
 * 一个需要 `pnpm install` 才能跑的量测脚本，在排查线上问题时恰恰最用不上。
 *
 * ── 用法 ──
 *   node scripts/bench-vercel.mjs                       # 稳态：三轮，取中位数
 *   node scripts/bench-vercel.mjs --series=10           # ★ 连续打 10 次，看"慢请求占比"
 *   node scripts/bench-vercel.mjs --rounds=5            # 多跑几轮
 *   node scripts/bench-vercel.mjs --cold --idle=300     # 先闲置 5 分钟，测冷启动
 *   node scripts/bench-vercel.mjs --url=https://xxx     # 换目标（默认生产域名）
 *   node scripts/bench-vercel.mjs --headers             # 额外打印响应头
 *   node scripts/bench-vercel.mjs --handshake           # 附带测 DNS/TCP/TLS（默认关闭，见正文）
 *
 * ⚠️ 判断"慢不慢"请认准 `--series`：中位数会把冷启动藏起来，
 *    而用户感受到的是"一半的点击在等 6.6 秒"这种分布，不是一个平均值。
 */

import dns from 'node:dns/promises'
import net from 'node:net'
import tls from 'node:tls'

/** 默认目标：生产域名 */
const DEFAULT_URL = 'https://studyplan-teal.vercel.app'

/** 默认轮数。取 3 是因为"取中位数"至少要 3 个样本，再多收益递减 */
const DEFAULT_ROUNDS = 3

/** 冷启动模式的默认闲置秒数。Vercel 文档说无流量约 5 分钟回收 */
const DEFAULT_IDLE = 300

/**
 * 稳态探针。
 *
 * 这三个路径刻意覆盖了三种成本结构，缺一个就拆不开归因：
 *   · health  —— 只 ping 数据库，几乎不含业务逻辑 → 代表"纯链路成本"
 *   · home    —— SSR 整页渲染 + 多次取数           → 代表"SSR 成本"
 *   · posts   —— 纯 API 取数                        → 代表"DB 成本"
 * 三者相减就能大致拆出网络 / 渲染 / 数据库各占多少。
 */
const PROBES = [
  { name: 'health', path: '/api/health' },
  { name: 'home', path: '/' },
  { name: 'posts', path: '/api/posts?page=1&pageSize=10' },
]

/**
 * "慢请求"的判定阈值（毫秒）。
 *
 * 为什么是 3 秒而不是别的数？因为热态下最慢的端点（SSR 首页）也就 1~2 秒，
 * 而实测到的冷启动是 5~7 秒 —— 3 秒正好落在两者中间的空白处，
 * 能把"应用慢"和"容器被回收了"干净地切开。
 */
const COLD_TTFB_MS = 3000

/* ------------------------------------------------------------------ *
 * 参数
 * ------------------------------------------------------------------ */

function parseArgs(argv) {
  const out = {}
  for (const arg of argv.slice(2)) {
    const matched = /^--([^=]+)(?:=(.*))?$/.exec(arg)
    if (matched) out[matched[1]] = matched[2] ?? 'true'
  }
  return out
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const fmt = (ms) => ms.toFixed(3).padStart(8)

const median = (list) => {
  const sorted = [...list].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/* ------------------------------------------------------------------ *
 * 分段计时
 * ------------------------------------------------------------------ */

/**
 * 给一个 Promise 套上限时。
 *
 * 为什么握手探测需要它？因为 `dns.lookup` 走的是**操作系统的
 * getaddrinfo**，在 Windows 上它会依次尝试 LLMNR / NetBIOS 广播，
 * 装了代理或虚拟网卡的机器上常常要十几秒 —— 而 curl 用同一台机器
 * 只要 10 毫秒。这个数字是**本机名称解析策略的产物，不是网络延迟**，
 * 一旦被当成真实握手成本，整个归因就会跑偏。
 * 所以超时就直接放弃这一段，宁可少一个指标，也不给一个假指标。
 */
function withTimeout(promise, ms) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`超过 ${ms}ms`)), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

/**
 * 测"新建一条连接"要多久：DNS → TCP → TLS。
 *
 * 为什么单独测、而不是从请求里扣？
 *   因为 HTTP 客户端会**复用连接**（keep-alive），复用时这三段的耗时是 0。
 *   "新建连接的成本"于是只在**冷启动后的第一个请求**上出现一次，
 *   混在请求耗时里就永远看不出来。单独测一次，才知道它值不值得优化。
 *
 * ⚠️ 这三个数字只作**参考**：DNS 与 TCP 走的是本机解析策略，
 *    经常被代理 / 虚拟网卡放大到秒级。可信的是下面的 TTFB。
 */
async function measureHandshake(hostname, port = 443) {
  const t0 = performance.now()
  const { address } = await dns.lookup(hostname)
  const dnsMs = performance.now() - t0

  const t1 = performance.now()
  const socket = await new Promise((resolve, reject) => {
    const sock = net.connect({ host: address, port })
    sock.once('connect', () => resolve(sock))
    sock.once('error', reject)
  })
  const tcpMs = performance.now() - t1

  const t2 = performance.now()
  await new Promise((resolve, reject) => {
    const secure = tls.connect({ socket, servername: hostname })
    secure.once('secureConnect', () => {
      secure.destroy()
      resolve()
    })
    secure.once('error', reject)
  })
  const tlsMs = performance.now() - t2

  return { dnsMs, tcpMs, tlsMs, address }
}

/**
 * 测一次 HTTP 请求的 TTFB 与总耗时。
 *
 * `await fetch(...)` 在**响应头到达**时就 resolve，
 * 所以到这一步的时间就是 TTFB；再 `arrayBuffer()` 读完 body 才是总耗时。
 * 两者之差 ≈ 传输体积带来的时间。
 */
async function timeFetch(url) {
  const started = performance.now()
  const response = await fetch(url, { redirect: 'follow' })
  const ttfb = performance.now() - started
  const body = await response.arrayBuffer()
  const total = performance.now() - started

  return { status: response.status, ttfb, total, bytes: body.byteLength, headers: response.headers }
}

/** 对同一路径跑 N 轮。第一轮作预热丢弃（用来填连接池，不计入统计） */
async function benchPath(url, rounds) {
  await timeFetch(url)

  const samples = []
  for (let i = 0; i < rounds; i += 1) {
    samples.push(await timeFetch(url))
    // 留一点间隔，避免把上一轮的服务端缓存/时间片算进下一轮
    await sleep(150)
  }
  return samples
}

/* ------------------------------------------------------------------ *
 * 静态产物探测
 * ------------------------------------------------------------------ */

/**
 * 从首页 HTML 里抓一个真实的 `/_nuxt/*.js` 路径。
 *
 * 为什么不写死文件名？因为文件名带内容哈希，**每次构建都变**。
 * 写死的后果是：跑一次 404，然后你会以为是"静态资源挂了"。
 * 从 HTML 里现抓，才能保证测的一定是当前部署真实在用的那个文件。
 */
async function discoverAsset(baseUrl) {
  try {
    const response = await fetch(baseUrl)
    const html = await response.text()
    const matched = html.match(/\/_nuxt\/[A-Za-z0-9_\-.]+\.js/)
    return matched ? matched[0] : null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

async function main() {
  const args = parseArgs(process.argv)
  const baseUrl = (args.url ?? DEFAULT_URL).replace(/\/+$/, '')
  const rounds = Number(args.rounds ?? DEFAULT_ROUNDS)
  const { protocol, hostname } = new URL(baseUrl)

  if (protocol !== 'https:') {
    console.error(`只支持 https（TLS 分段是量测的一部分），收到：${baseUrl}`)
    process.exit(1)
  }

  console.log(`\n=== bench-vercel ===`)
  console.log(`目标：${baseUrl}`)

  /* ---- 冷启动模式：先闲置，再打第一个请求 ---- */
  if (args.cold) {
    const idleSec = Number(args.idle ?? DEFAULT_IDLE)
    console.log(`模式：冷启动（先闲置 ${idleSec}s）`)

    // 先打一发把容器预热，否则"上一次的冷启动"会污染这次的计时
    await timeFetch(`${baseUrl}/api/health`)

    const deadline = Date.now() + idleSec * 1000
    let lastBeep = 0
    while (Date.now() < deadline) {
      const remainSec = Math.ceil((deadline - Date.now()) / 1000)
      if (remainSec % 30 === 0 && remainSec !== lastBeep) {
        lastBeep = remainSec
        process.stdout.write(`\r  剩余 ${remainSec}s…   `)
      }
      await sleep(1000)
    }
    process.stdout.write(`\r  闲置结束，发起首个请求…        \n`)

    const cold = await timeFetch(`${baseUrl}/api/health`)
    console.log(
      `\n[冷启动] /api/health  status=${cold.status}  TTFB=${cold.ttfb.toFixed(3)}s  total=${cold.total.toFixed(3)}s`,
    )
    console.log(
      `判读：TTFB > 3s 说明确实触发了容器回收；< 1s 说明这个闲置时长还不够长，容器仍是热的。\n`,
    )
    return
  }

  /**
   * ---- 序列模式：连续打 N 次，暴露"冷启动占比" ----
   *
   * 为什么必须有这个模式？
   *   因为**中位数会把冷启动彻底藏起来**。实测中同一路径连续 8 次的 TTFB 是
   *   0.49 / 7.15 / 0.49 / 6.65 / 0.72 / 6.55 / 0.76 / 6.61 ——
   *   快与慢严格交替，中位数落在中间一个**谁都不是**的值上，
   *   看上去像"稳态 1 秒"，实际上用户有一半的点击在等 6.6 秒。
   *
   * 所以这个模式不取中位数，而是**逐个打印**并统计"慢请求占比" ——
   * 那才是用户真实体感的数字。
   */
  if (args.series) {
    const count = Number(args.series)
    console.log(`模式：序列（每路径连续 ${count} 次，看冷启动占比）\n`)

    for (const probe of PROBES) {
      const ttfbs = []
      for (let i = 0; i < count; i += 1) {
        const sample = await timeFetch(`${baseUrl}${probe.path}`)
        ttfbs.push(sample.ttfb)
        await sleep(120)
      }
      const slow = ttfbs.filter((t) => t > COLD_TTFB_MS)
      const pct = Math.round((slow.length / count) * 100)

      console.log(
        `[${probe.name.padEnd(6)}] ${ttfbs.map((t) => (t / 1000).toFixed(2).padStart(6)).join('')}`,
      )
      console.log(
        `         中位 ${(median(ttfbs) / 1000).toFixed(3)}s ｜ 慢请求(>${COLD_TTFB_MS / 1000}s) ${slow.length}/${count}（${pct}%）\n`,
      )
    }
    return
  }

  /* ---- 稳态模式 ---- */
  console.log(`模式：稳态（每路径 ${rounds} 轮，取中位数）\n`)

  /**
   * 握手探测**默认关闭**，用 `--handshake` 才跑。
   *
   * 为什么默认不跑？因为它测的是 `dns.lookup` → `net.connect` → `tls.connect`，
   * 其中 `dns.lookup` 走操作系统 getaddrinfo。实测在本机（装了代理/虚拟网卡）
   * 它会耗到 **30 秒以上**，而 curl 解析同一域名只要 10 毫秒 ——
   * 也就是说这个数字反映的是**本机名称解析策略**，不是到服务器的链路延迟。
   *
   * 把它放在默认路径上有两个坏处：
   *   1. 每次量测都先白等半分钟；
   *   2. 一个 30 秒的"握手"会让人误以为网络有问题，把归因带偏。
   *
   * 真正可信、也真正影响用户的是下面的 TTFB。想看握手时显式加 `--handshake`。
   */
  if (args.handshake) {
    try {
      const handshake = await withTimeout(measureHandshake(hostname), 4000)
      console.log(
        `握手（新建连接）dns=${fmt(handshake.dnsMs)}s tcp=${fmt(handshake.tcpMs)}s tls=${fmt(handshake.tlsMs)}s  → ${hostname} @ ${handshake.address}`,
      )
    } catch (error) {
      console.log(`握手（新建连接）：跳过（${error.message}）`)
    }
    console.log(`注：这三项受本机解析策略影响，可能被放大到秒级；请以下面 TTFB 为准。\n`)
  }

  console.log('路径           状态   TTFB(中位)   TTFB(最小)   TTFB(最大)   总耗时     体积')
  console.log('─'.repeat(78))

  const summary = []

  for (const probe of PROBES) {
    const samples = await benchPath(`${baseUrl}${probe.path}`, rounds)
    const ttfbs = samples.map((s) => s.ttfb)
    const totals = samples.map((s) => s.total)

    console.log(
      `${probe.name.padEnd(14)} ${String(samples[0].status).padEnd(6)}` +
        `${fmt(median(ttfbs) / 1000)}s ${fmt(Math.min(...ttfbs) / 1000)}s ${fmt(Math.max(...ttfbs) / 1000)}s ` +
        `${fmt(median(totals) / 1000)}s ${(median(samples.map((s) => s.bytes)) / 1024).toFixed(1)}KB`,
    )

    summary.push({ name: probe.name, ttfb: median(ttfbs) / 1000 })
  }

  const asset = await discoverAsset(baseUrl)
  if (asset) {
    const samples = await benchPath(`${baseUrl}${asset}`, rounds)
    const ttfbs = samples.map((s) => s.ttfb)
    console.log(
      `${'asset'.padEnd(14)} ${String(samples[0].status).padEnd(6)}` +
        `${fmt(median(ttfbs) / 1000)}s ${fmt(Math.min(...ttfbs) / 1000)}s ${fmt(Math.max(...ttfbs) / 1000)}s ` +
        `${fmt(median(samples.map((s) => s.total)) / 1000)}s ${(median(samples.map((s) => s.bytes)) / 1024).toFixed(1)}KB`,
    )
    summary.push({ name: 'asset', ttfb: median(ttfbs) / 1000 })
  }

  console.log('─'.repeat(78))

  /* ---- 归因提示 ---- */
  const get = (name) => summary.find((s) => s.name === name)?.ttfb ?? 0
  const health = get('health')
  const posts = get('posts')
  const home = get('home')

  console.log(`\n归因（三者相减即可粗拆）：`)
  console.log(
    `  · 纯链路（health，含跨区 DB ping）      ≈ ${health.toFixed(3)}s`,
  )
  if (posts > health) {
    console.log(`  · DB 业务取数（posts - health）          ≈ ${(posts - health).toFixed(3)}s`)
  }
  if (home > posts) {
    console.log(`  · SSR 渲染（home - posts）               ≈ ${(home - posts).toFixed(3)}s`)
  }
  console.log(`  · 合计稳态首字节                         ≈ ${home.toFixed(3)}s`)

  /* ---- 响应头（可选）---- */
  if (args.headers) {
    const interesting = ['cache-control', 'x-vercel-cache', 'age', 'x-vercel-id', 'content-type']
    for (const probe of [{ name: 'home', path: '/' }, ...(asset ? [{ name: 'asset', path: asset }] : [])]) {
      const response = await fetch(`${baseUrl}${probe.path}`)
      console.log(`\n[${probe.name}] ${probe.path}`)
      for (const key of interesting) {
        const value = response.headers.get(key)
        if (value) console.log(`  ${key}: ${value}`)
      }
    }
  }

  console.log('')
}

main().catch((error) => {
  console.error('量测失败：', error.message)
  process.exit(1)
})
