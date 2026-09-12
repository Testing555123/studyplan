/**
 * Vercel 容器入口 —— **零依赖**，只用 Node 内置模块。
 * ============================================================
 *
 * 为什么需要它？
 *   平台的约定是"**一个容器 = 一个 HTTP 服务**，监听 $PORT"，
 *   而我们要在这一个容器里同时跑两个进程：
 *     - NestJS  后端（内部 3000）
 *     - Nuxt SSR 前端（内部 3001）
 *   于是就需要一个前台进程：它既监听 $PORT 对外，又按路径把请求
 *   分流给两个子进程。这个文件就是它。
 *
 * 为什么不用 Nginx / Caddy 之类的现成网关？
 *   因为它们都要额外装一个二进制、再学一套配置语法；
 *   而这里的需求只有"按前缀转发"，Node 内置的 http 模块三十行就够。
 *   —— 少一个组件，就少一处只能靠文档才能排错的地方。
 *
 * 路径约定：
 *   /api/**  → 后端（含统一响应包装、限流、健康检查）
 *   /docs**  → 后端（Swagger，生产由网关加口令保护）
 *   其余     → 前端（SSR 页面与静态资源）
 *
 * 环境变量：
 *   PORT                对外端口（**平台要求**，Vercel 默认 80）
 *   API_INTERNAL_PORT   后端内部端口，默认 3000
 *   WEB_INTERNAL_PORT   前端内部端口，默认 3001
 */

import http from 'node:http'
import net from 'node:net'
import { spawn } from 'node:child_process'

const PORT = Number(process.env.PORT ?? 80)
const API_PORT = Number(process.env.API_INTERNAL_PORT ?? 3000)
const WEB_PORT = Number(process.env.WEB_INTERNAL_PORT ?? 3001)

/** 需要打到后端的路径前缀。加 /docs 是为了让 Swagger 也能被访问与验证。 */
const API_PREFIXES = ['/api', '/docs']

const children = []

/* ---------------------------------------------------------------
 * 1) 启动两个子进程
 * ------------------------------------------------------------- */

/**
 * 用 `process.execPath` 而不是写 `node`：
 * 前者是"当前正在运行的这个 Node 解释器"的绝对路径，
 * 不依赖 PATH —— 容器里 PATH 没配好是最常见的"子进程起不来"原因。
 */
function startChild(name, entry, extraEnv) {
  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, ...extraEnv },
    // stdio 直接继承：子进程的日志就是容器日志，不需要额外收集
    stdio: ['ignore', 'inherit', 'inherit'],
  })

  child.on('exit', (code, signal) => {
    /**
     * 刻意**不**在子进程退出时结束容器。
     *
     * 让容器继续活着有两个好处：
     *   1. 日志能留下来给你看（容器一退，平台往往只保留一条退出记录）；
     *   2. 一个子进程挂掉时，另一个仍然可用 —— 例如后端崩了，
     *      前端至少还能返回一个页面而不是整站 502。
     * 相关的请求会拿到 502，那个错误比"容器神秘退出"好排查得多。
     */
    console.error(`[entrypoint] ⚠️ 子进程 ${name} 已退出 code=${code} signal=${signal}`)
  })

  children.push(child)
  console.log(`[entrypoint] 已启动 ${name}（pid=${child.pid}）`)
  return child
}

startChild('api', 'apps/api/dist/main.js', {
  // ⚠️ 必须覆盖 PORT：容器对外的 PORT 是平台给的（可能是 80），
  //    而 NestJS 也是读 PORT 来决定监听端口的 —— 不覆盖的话
  //    两个进程会抢同一个端口，现象是后起的那一个直接崩掉。
  PORT: String(API_PORT),
})

startChild('web', 'apps/web/.output/server/index.mjs', {
  PORT: String(WEB_PORT),
  HOST: '0.0.0.0',
  /**
   * 同域部署时接口地址用**相对路径**：
   *   - 同域 → Cookie 天然同源，不需要任何跨站配置；
   *   - 不带域名 → 以后换域名不用重新构建前端。
   * 这两条是"前后端同域"最实在的收益。
   */
  NUXT_PUBLIC_API_BASE: '/api',
  // SSR 期间是容器内部发请求，走回环地址，不绕公网
  NUXT_API_BASE_INTERNAL: `http://127.0.0.1:${API_PORT}/api`,
})

/* ---------------------------------------------------------------
 * 2) 等待子进程就绪
 * ------------------------------------------------------------- */

/**
 * 轮询"端口能不能连上"，判断服务是否已经起来。
 *
 * 为什么不用 fetch 探活？
 *   因为此刻我们只关心 TCP 是否在听。真正判断业务是否健康是
 *   `/api/health` 的事（Terminus），不该在入口里重复实现一遍。
 */
function waitForPort(port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const attempt = () => {
      const socket = net.connect({ port, host: '127.0.0.1' })
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() > deadline) resolve(false)
        else setTimeout(attempt, 500)
      })
    }
    attempt()
  })
}

/**
 * 上游"已就绪"的缓存 + 等待。
 *
 * 为什么需要这一层？因为平台是**缩容到零**的模型：
 * 无流量 5 分钟后实例被回收，下一个访客会打在一个**全新实例**上，
 * 而此刻两个子进程都还在启动（实测 Nest 约 2-5 秒）。
 *
 * 如果这段时间内的请求被直接打回 502，表现就是：
 *   "每天第一个访客大概率看到一片空白 / 502，刷新一下又好了" ——
 *   这类问题极难复现、极难归因。
 *
 * 所以策略是：**监听立即开（满足平台启动超时），请求则等待上游就绪**。
 * 就绪后就缓存下来，后续请求零等待；等待超时才回 502（并留下日志）。
 */
const readyPorts = new Set()

async function waitUntilReady(port, timeoutMs = 20_000) {
  if (readyPorts.has(port)) return true
  const ok = await waitForPort(port, timeoutMs)
  if (ok) readyPorts.add(port)
  return ok
}

/* ---------------------------------------------------------------
 * 3) 对外监听，按路径分流
 * ------------------------------------------------------------- */

function isApiPath(url = '/') {
  return API_PREFIXES.some((prefix) => url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`))
}

const server = http.createServer(async (req, res) => {
  const targetPort = isApiPath(req.url) ? API_PORT : WEB_PORT

  /**
   * 冷启动窗口内"等一等"，而不是立刻回 502。
   *
   * 这一条是被**真实 E2E 打出来的**：线上跑 Playwright 时，
   * 第一条用例拿到的整页内容只有「上游服务暂时不可用」——
   * 因为那次请求正好落在实例冷启动的几秒里。
   * 本地永远复现不到（本地进程一直活着），只有线上缩容才有这个窗口。
   */
  if (!(await waitUntilReady(targetPort))) {
    console.error(`[entrypoint] ⚠️ 上游 ${targetPort} 在等待窗口内仍未就绪，返回 502`)
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('上游服务暂时不可用')
    return
  }

  /**
   * 转发前把代理相关请求头规范化。
   *
   * 为什么要动 x-forwarded-for？
   *   后端的限流与日志要靠它拿到**真实客户端 IP**。
   *   平台边缘节点已经在 XFF 里留下了客户端地址（最左边那一段），
   *   如果我们在后面再追加一跳，后端反而会把"平台边缘节点"当成客户端，
   *   限流就退化成"所有用户共用一个桶"。
   *   所以这里做的是**取最左一段并覆盖**，而不是追加。
   */
  const headers = { ...req.headers }
  const incomingXff = req.headers['x-forwarded-for']
  const clientIp =
    (typeof incomingXff === 'string' ? incomingXff.split(',')[0].trim() : '') ||
    req.socket.remoteAddress ||
    ''

  if (clientIp) headers['x-forwarded-for'] = clientIp
  if (req.headers.host) headers['x-forwarded-host'] = req.headers.host
  // 平台已经终止了 TLS，容器内是明文 HTTP，如实告知下游
  headers['x-forwarded-proto'] = 'https'

  const upstream = http.request(
    { host: '127.0.0.1', port: targetPort, method: req.method, path: req.url, headers },
    (upstreamRes) => {
      // 注意：这里整份 headers 透传，Set-Cookie 的数组形态会被保留。
      // 用对象手写几个头会把 Cookie 弄丢 —— 那是"登录成功但一刷新就掉线"的经典成因。
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
      upstreamRes.pipe(res)
    },
  )

  upstream.on('error', (error) => {
    console.error(`[entrypoint] 转发失败 ${req.method} ${req.url} → ${targetPort}: ${error.message}`)
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    }
    res.end('上游服务暂时不可用')
  })

  req.pipe(upstream)
})

/**
 * ⚠️ 这里是**先监听，再异步探测就绪**，顺序不能倒。
 *
 * 为什么不能"等两个子进程都就绪了再 listen"？
 *   平台的存活探测有**启动超时**（实测约 28 秒）。
 *   一旦某个子进程起不来（配置错误、依赖缺失都算），
 *   我们就永远等不到端口就绪，$PORT 也就永远不开 ——
 *   平台会直接判定"容器没有提供 HTTP 服务"并返回 502，
 *   那条超时错误会把子进程真正报的错**盖掉**。
 *   （这不是假设：本地验证时后端因环境变量校验失败退出，
 *     正是这个顺序让线上只能看到 "could not connect to $PORT"，
 *     而看不到下面那句真正的 NODE_ENV 校验错误。）
 *
 *   先监听之后：子进程的日志照样打出来，请求也能立刻得到
 *   「502 + 上游服务暂时不可用」这种可诊断的回应，而不是黑洞。
 */
server.on('error', (error) => {
  console.error(`[entrypoint] ❌ 无法监听 ${PORT}：${error.message}`)
  if (error.code === 'EACCES') {
    console.error(
      `[entrypoint] 这是权限问题：1024 以下的端口需要 root 或 CAP_NET_BIND_SERVICE。` +
        `容器以非 root 运行，因此需要平台把 PORT 设为非特权端口（如 3000）。`,
    )
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `[entrypoint] 监听 0.0.0.0:${PORT}｜${API_PREFIXES.join('、')} → ${API_PORT}｜其余 → ${WEB_PORT}`,
  )
})

// 监听已经生效，这里只是"事后探测"并给出可诊断的提示，不阻塞对外服务
void (async () => {
  const [apiReady, webReady] = await Promise.all([waitForPort(API_PORT), waitForPort(WEB_PORT)])
  if (!apiReady) console.error(`[entrypoint] ⚠️ 后端 ${API_PORT} 始终未就绪，/api 请求会得到 502`)
  if (!webReady) console.error(`[entrypoint] ⚠️ 前端 ${WEB_PORT} 始终未就绪，页面请求会得到 502`)
  if (apiReady && webReady) console.log('[entrypoint] 两个子进程均已就绪')
})()

/* ---------------------------------------------------------------
 * 4) 优雅退出
 * ------------------------------------------------------------- */

/**
 * 平台缩容时会给容器发 SIGTERM，并留 30 秒宽限期。
 *
 * 我们要做的只有两件事：把信号转发给子进程（让它们有机会关掉
 * 数据库连接、写完日志），然后在一个**比宽限期略短**的时间点强制退出。
 * 留 25 秒而不是 30 秒，是为了别和被强杀撞在一起 ——
 * 被 SIGKILL 结束的进程不会留下任何日志，只能看到"容器没了"。
 */
let shuttingDown = false

function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[entrypoint] 收到 ${signal}，开始优雅退出`)

  server.close()
  for (const child of children) child.kill('SIGTERM')

  setTimeout(() => {
    console.log('[entrypoint] 宽限期结束，强制退出')
    process.exit(0)
  }, 25_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
