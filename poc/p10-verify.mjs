/**
 * 批次 10 验证脚本：电子书（30 篇）从 `apps/docs`（VitePress 独立站）
 * 迁进主站 `apps/web` 的 `/ebook` 前缀。
 *
 * 由 `poc/p19-docs/verify.mjs`（沙盒里 16/16 通过的那份）改编：
 *   · 分组表、stages 与 exercises 同名不同前缀互不吞掉的检查、SSR 首屏含 h1 的检查，
 *     全部原样继承；
 *   · 重定向那 5 项被拆到 `--redirects` 档 —— 批次 10 硬约束写明
 *     「routeRules 的 301 必须在内容迁移验证完成后才启用」，
 *     所以本轮它们**不该**通过，把它们算进通过率就是造假。
 *
 * 三档，按能跑到哪跑到哪：
 *   node poc/p10-verify.mjs              只查静态树（19 项，不需要构建，本机可跑）
 *   node poc/p10-verify.mjs --runtime    起 .output 跑运行时 14 项（需先 nuxt build）
 *   node poc/p10-verify.mjs --redirects  10 项内容 + 5 项 301（需已取消 routeRules 注释并重新 build）
 *
 * 退出码：0 = 已跑的档位全过；1 = 有 FAIL。
 * ⚠️ 静态通过 **不等于** 迁移成功：Content 能否解析 30 篇、SSR 首屏有没有正文，
 *    只有 `--runtime` 那一档说得准。脚本不会替构建说话。
 *
 * ── 要让 --runtime 这一档跑起来，人和顺序都必须照下面走 ──
 *   # 1) 依赖（协调会话的活；本机 `pnpm add` 会撞 ERR_PNPM_EPERM）
 *   #    版本按 P19 沙盒实测锁定：@nuxt/content 3.16.1 + better-sqlite3 12.4.1
 *   pnpm --filter @studyplan/web add @nuxt/content@3.16.1 better-sqlite3@12.4.1
 *   # 2) 放行原生构建：pnpm-workspace.yaml 的 allowBuilds 里加 `better-sqlite3: true`
 *   #    不放行的后果不是报错而是**静默**缺 .node 二进制，Content 打不开索引库
 *   pnpm install
 *   # 3) 自检：node -e "import('better-sqlite3').then(m=>console.log(typeof m.default))"
 *   # 4) 构建。⚠️ 已知陷阱：nitro 每次 `rm -rf .output` 会触发环境的批量删除保护，
 *   #    表现为「构建 exit 1，但 .output 还是上一次的旧产物」—— 一定看退出码。
 *   #    规避：先 `mv apps/web/.output apps/web/.output.bak-$(date +%H%M%S)` 再构建
 *   pnpm --filter @studyplan/web build
 *   # 5) 验证（会自己起 .output/server/index.mjs，端口 PORT 覆盖，默认 3011）
 *   node poc/p10-verify.mjs --runtime
 *   # 6) 上一档 14 项全绿，才允许做第二次发布：取消 apps/web/nuxt.config.ts 里
 *   #    routeRules 的注释 → 重新 build → node poc/p10-verify.mjs --redirects
 *   # 7) 容器侧（批次 11 的活，这里只记着）：`node:24-alpine` 要
 *   #    `apk add python3 make g++`，否则 better-sqlite3 从源码编译直接失败
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const WEB = join(ROOT, 'apps/web')
const CONTENT = join(WEB, 'content')
const LEGACY_DOCS = join(ROOT, 'apps/docs')
const PAGES_DIR = join(WEB, 'app/pages/ebook')

const RUNTIME = process.argv.includes('--runtime') || process.argv.includes('--redirects')
const WITH_REDIRECTS = process.argv.includes('--redirects')
const PORT = Number(process.env.PORT ?? 3011)
const BASE = `http://127.0.0.1:${PORT}`

/** 分组与期望篇数：30 = 8 guide + 8 stages + 8 exercises + 5 design + index.md */
const EXPECTED_COUNTS = { guide: 8, stages: 8, exercises: 8, design: 5 }
const EXPECTED_TOTAL_MD = 30
const EXPECTED_CONTENT_ROUTES = 29 // 30 减去 index.md（它是 /ebook 目录页本身）

const GROUP_LABELS = ['开始之前', '阶段正文', '经验档案', '设计', '规划练习']

/**
 * 根绝对文档链接补 /ebook 前缀 —— 与本轮实际改动用的规则一字不差。
 * 用它做「内容 = 旧站 + 仅这一种改动」的对账，别的偏差一律算失败。
 */
function prefixDocLinks(md) {
  return md.replace(/\]\(\/(guide|stages|exercises|design)\//g, '](/ebook/$1/')
}

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
function note(name, detail) {
  console.log(`SKIP  ${name} — ${detail}`)
}

function read(...p) {
  return readFileSync(join(...p), 'utf8')
}
function mdFiles(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...mdFiles(full))
    else if (e.name.endsWith('.md')) out.push(full)
  }
  return out
}

// ─────────────────────────────────────────────────────────────
// A. 静态检查（本机可跑，不碰构建）
// ─────────────────────────────────────────────────────────────

const allMd = mdFiles(CONTENT)
const byGroup = {}
for (const g of Object.keys(EXPECTED_COUNTS)) {
  byGroup[g] = allMd
    .filter((f) => relative(CONTENT, f).startsWith(`${g}/`))
    .map((f) => relative(CONTENT, f))
}

// ① 硬约束「实际 30 篇，不是 31」：总数 + 无 roadmap-rewrite-lessons
const countsOk = Object.keys(EXPECTED_COUNTS).every((g) => byGroup[g].length === EXPECTED_COUNTS[g])
record(
  `① 内容文件数：共 ${EXPECTED_TOTAL_MD}（guide 8 / stages 8 / exercises 8 / design 5 / index 1）`,
  allMd.length === EXPECTED_TOTAL_MD && countsOk && existsSync(join(CONTENT, 'index.md')),
  `实际 md ${allMd.length}，分布 ${Object.keys(EXPECTED_COUNTS)
    .map((g) => `${g}:${byGroup[g].length}`)
    .join(' ')}`,
)
record('①b 不存在的第 31 篇没有混进来', !allMd.some((f) => f.includes('roadmap-rewrite-lessons')))

// ② 除 index.md 外均无 frontmatter → schema 不能要求任何字段
const withFrontmatter = allMd
  .filter((f) => !f.endsWith('index.md'))
  .filter((f) => read(f).split('\n')[0].trim() === '---')
  .map((f) => relative(CONTENT, f))
record(
  '② 29 篇正文确实没有 frontmatter（index.md 除外）',
  withFrontmatter.length === 0,
  withFrontmatter.join(', '),
)

// ③ content.config.ts：前缀 / 排除 / 全字段 optional
const cfg = read(WEB, 'content.config.ts')
const docsBlock = cfg.slice(cfg.indexOf('docs: defineCollection'), cfg.indexOf('ebookHome:'))
const schemaBlock = docsBlock.slice(docsBlock.indexOf('schema: z.object({'))
const schemaFields = schemaBlock.split('\n').filter((l) => /^\s+\w+:\s*z\./.test(l))
const nonOptional = schemaFields.filter((l) => !l.includes('.optional()'))
record(
  `③ 集合 schema 里 ${schemaFields.length} 个字段全部 optional（没 frontmatter 也不会构建失败）`,
  schemaFields.length > 0 && nonOptional.length === 0,
  nonOptional.join(' | '),
)
record(
  '③b docs 集合：type page + include **/*.md + exclude index.md + prefix /ebook',
  /type:\s*'page'/.test(docsBlock) &&
    docsBlock.includes("include: '**/*.md'") &&
    docsBlock.includes("exclude: ['index.md']") &&
    docsBlock.includes("prefix: '/ebook'"),
)
// 首页（index.md）单独成集合，且 layout/hero/features 三个 VitePress 键都声明过 ——
// 少声明一个，构建期就可能因未知 frontmatter 字段失败
const homeBlock = cfg.slice(cfg.indexOf('ebookHome: defineCollection'))
record(
  '③c index.md 由 ebookHome 集合接管，VitePress 专属键已全部声明为可选',
  homeBlock.includes("include: ['index.md']") &&
    homeBlock.includes("prefix: '/ebook'") &&
    ['layout', 'hero', 'features'].every((k) => homeBlock.includes(`${k}: z.any().optional()`)),
  homeBlock ? '' : '集合不存在',
)

// ④ Content 3 不自动为 type:'page' 生成路由 → catch-all + queryCollection().path()
const catchAllPath = join(PAGES_DIR, '[...slug].vue')
const catchAll = existsSync(catchAllPath) ? read(catchAllPath) : ''
record(
  '④ catch-all 页面存在并用 queryCollection(...).path(route.path) 取正文（含换 path 重建实例的 key）',
  catchAll.includes("queryCollection('docs')") &&
    /\.path\(/.test(catchAll) &&
    catchAll.includes('<ContentRenderer') &&
    catchAll.includes('createError') &&
    /statusCode:\s*404/.test(catchAll) &&
    /definePageMeta\(\{[\s\S]*?key:/.test(catchAll),
  existsSync(catchAllPath) ? relative(ROOT, catchAllPath) : '文件缺失',
)

// ⑤ 路由树唯一：ebook/ 下只有 index.vue 与 [...slug].vue，没有第二棵树
const pageEntries = existsSync(PAGES_DIR) ? readdirSync(PAGES_DIR) : []
record(
  '⑤ /ebook 下只有一棵路由树（结构上排除 stages 与 exercises 互相吞掉）',
  pageEntries.length === 2 &&
    pageEntries.includes('[...slug].vue') &&
    pageEntries.includes('index.vue'),
  pageEntries.join(', '),
)

// ⑥ 目录页 5 组导航 + 29 条 path 与内容文件双向对齐
const indexPath = join(PAGES_DIR, 'index.vue')
const indexVue = existsSync(indexPath) ? read(indexPath) : ''
const tocPaths = [
  ...new Set([...indexVue.matchAll(/path:\s*'(\/ebook\/[^']+)'/g)].map((m) => m[1])),
]
const contentRoutes = allMd
  .filter((f) => !f.endsWith('index.md'))
  .map((f) => `/ebook/${relative(CONTENT, f).replace(/\.md$/, '')}`)
  .sort()
const tocMissing = contentRoutes.filter((p) => !tocPaths.includes(p))
const tocGhost = tocPaths.filter((p) => !contentRoutes.includes(p))
record(
  '⑥ 目录页 5 组导航齐全，且 29 条 path 与内容文件双向一一对应',
  GROUP_LABELS.every((g) => indexVue.includes(g)) &&
    tocPaths.length === EXPECTED_CONTENT_ROUTES &&
    tocMissing.length === 0 &&
    tocGhost.length === 0,
  `分组 ${GROUP_LABELS.filter((g) => indexVue.includes(g)).length}/5，目录 ${tocPaths.length} 条，缺 ${tocMissing.join(',') || '无'}，幽灵 ${tocGhost.join(',') || '无'}`,
)
record(
  '⑥b 同名不同前缀两套 path 同时存在于目录（stages/stage-1 与 exercises/stage-1）',
  tocPaths.includes('/ebook/stages/stage-1') && tocPaths.includes('/ebook/exercises/stage-1'),
)

// ⑦ 301 未启用（本轮要求）：所有 redirect / routeRules 都必须是注释行
const nuxt = read(WEB, 'nuxt.config.ts')
const lines = nuxt.split('\n')
/**
 * 「这行还是注释吗」——本仓库的注释一律是 `//` 行注释或 ` * ` 块注释续行，
 * 所以按行首判断就够；不能只判断 `//`，那样 JSDoc 里举例写的
 * `{ redirect: '/x' }`（讲 307 那段）会被误判成生效中的规则。
 */
const isComment = (l) => /^\s*(\/\/|\*|\/\*)/.test(l)
const activeRedirect = lines.filter((l) => l.includes('redirect:') && !isComment(l))
const activeRouteRules = lines.filter((l) => /routeRules:/.test(l) && !isComment(l))
const commented301 = lines.filter((l) => l.trim().startsWith('//') && l.includes('statusCode: 301'))
record(
  '⑦ 重定向保持注释状态：没有生效中的 routeRules / redirect',
  activeRedirect.length === 0 && activeRouteRules.length === 0,
  `生效 redirect ${activeRedirect.length}，生效 routeRules ${activeRouteRules.length}`,
)
record(
  '⑦b 注释里备好的规则显式写了 statusCode: 301（简写 redirect 发的是 307）',
  commented301.length >= 4 && nuxt.includes('307'),
  `注释中的 301 规则 ${commented301.length} 条`,
)

// ⑧ 内容对账：与旧站逐字节相同，唯一允许的差别是链接加了 /ebook 前缀
let unexpectedDiff = 0
let rewritten = 0
for (const f of allMd) {
  const rel = relative(CONTENT, f)
  const legacy = join(LEGACY_DOCS, rel)
  if (!existsSync(legacy)) continue
  const a = read(legacy)
  const b = read(f)
  if (a !== b) {
    if (prefixDocLinks(a) === b)
      rewritten += (a.match(/\]\(\/(guide|stages|exercises|design)\//g) || []).length
    else {
      unexpectedDiff += 1
      console.log(`   非预期改动的文件：${rel}`)
    }
  }
}
record(
  '⑧ 迁移内容与旧站逐字节一致，差别只有 /ebook 链接前缀',
  unexpectedDiff === 0,
  `非预期改动 ${unexpectedDiff} 个文件；已加前缀的链接 ${rewritten} 条`,
)
record('⑧b 旧站 apps/docs 仍在（本轮只做加法，删除要等构建验证）', existsSync(LEGACY_DOCS))

// ⑨ 链接形状：不存在漏前缀的根绝对文档链接，也不存在重复前缀
const badAbs = []
const dupPrefix = []
for (const f of allMd) {
  const txt = read(f)
  for (const m of txt.matchAll(/\]\(\/(guide|stages|exercises|design)\//g))
    badAbs.push(`${relative(CONTENT, f)}:${m[0]}`)
  if (txt.includes('/ebook/ebook')) dupPrefix.push(relative(CONTENT, f))
}
record(
  '⑨ 正文里没有未加 /ebook 前缀的根绝对文档链接，也没有重复前缀',
  badAbs.length === 0 && dupPrefix.length === 0,
  `漏前缀 ${badAbs.join(',') || '无'}；重复 ${dupPrefix.join(',') || '无'}`,
)
const relativeLinks = allMd.reduce(
  (n, f) => n + (read(f).match(/\]\(\.\/[^)]+\)/g) || []).length,
  0,
)
record(
  '⑨b 相对链接原样保留（由 Content 按当前文档 path 解析）',
  relativeLinks === 5,
  `实际 ${relativeLinks} 条`,
)

// ⑩ 应用内入口指向站内 /ebook，不再有任何指向外部文档站的配置
const footer = read(WEB, 'app/components/AppFooter.vue')
const home = read(WEB, 'app/pages/index.vue')
const activeDocsUrl = lines.filter((l) => /^\s*docsUrl:/.test(l))
record(
  '⑩ 页脚与首页的电子书入口都是站内 to="/ebook"',
  footer.includes('to="/ebook"') &&
    home.includes('to="/ebook"') &&
    !footer.includes('docsUrl') &&
    !home.includes('docsUrl'),
)
record(
  '⑩b runtimeConfig 里 docsUrl 已移除（不再有"另一个文档站"这个概念）',
  activeDocsUrl.length === 0,
  `仍存在的 docsUrl 配置 ${activeDocsUrl.length} 处`,
)
record('⑩c @nuxt/content 已注册进 modules', /modules:\s*\[[^\]]*'@nuxt\/content'/.test(nuxt))

// ⑪ 依赖前置：这两项缺失时构建必然跑不起来，属于协调会话的活，不算通过也不算失败
const webPkg = JSON.parse(read(WEB, 'package.json'))
const deps = { ...webPkg.dependencies, ...webPkg.devDependencies }
const needContent = deps['@nuxt/content'] ? 'PASS' : 'PENDING'
const needSqlite = deps['better-sqlite3'] ? 'PASS' : 'PENDING'
const allowBuilds = read(ROOT, 'pnpm-workspace.yaml')
const needAllow = /better-sqlite3:\s*true/.test(allowBuilds) ? 'PASS' : 'PENDING'
console.log(
  `前置  apps/web 依赖与构建白名单：@nuxt/content=${needContent} better-sqlite3=${needSqlite} allowBuilds=${needAllow}`,
)
if (needContent === 'PENDING' || needSqlite === 'PENDING' || needAllow === 'PENDING') {
  console.log('      → 依赖由协调会话安装；未装齐之前不要宣称迁移已验证（见文件头「三档」说明）。')
}

// 构建产物存在性：静态档不假装自己构建过
const hasOutput = existsSync(join(WEB, '.output/server/index.mjs'))
console.log(
  `现状  apps/web/.output/server/index.mjs ${hasOutput ? '存在' : '不存在（尚未 nuxt build）'}`,
)

/**
 * 部署侧待办（这一档**管不到**线上：静态与 --runtime 读的都是本地产物）。
 * entrypoint 里仍有 /ebook 的静态读盘分支，Dockerfile.vercel 仍构建
 * @studyplan/docs → 生产环境的 /ebook 目前由入口脚本代管，
 * Nuxt 里这些新页面上线了也看不见。删它要等 --runtime 全绿，
 * 并且和 apps/docs 一起在同一次发布里删（顺序敏感项 7）。
 */
const entry = read(ROOT, 'docker/vercel/entrypoint.mjs')
console.log(
  `待办  生产 /ebook 仍被 entrypoint 静态分支拦截：${entry.includes('EBOOK_PREFIX') ? '是（--runtime 全绿后与 apps/docs 同批删除）' : '否，可以收尾'}`,
)

if (!RUNTIME) {
  const failed = results.filter((r) => !r.ok)
  console.log(
    `\n静态档合计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}。`,
  )
  console.log(
    '运行时 14 项（10 项内容可达 + 4 项「重定向本轮不该生效」的负向检查）' +
      '尚未验证：需要装齐依赖并 nuxt build，命令见 poc/p10-verify.mjs 文件头。',
  )
  process.exit(failed.length === 0 ? 0 : 1)
}

// ─────────────────────────────────────────────────────────────
// B. 运行时检查（继承 P19 的 16 项，拆掉本轮不该启用的 301 部分）
// ─────────────────────────────────────────────────────────────

if (!hasOutput) {
  record(
    '运行时前置：apps/web/.output/server/index.mjs 存在',
    false,
    '先 nuxt build 再加 --runtime',
  )
  process.exit(1)
}

const contentPaths = contentRoutes.sort()

async function waitForServer(timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      return await fetch(BASE + '/ebook', { redirect: 'manual' })
    } catch {
      await sleep(500)
    }
  }
  throw new Error('server did not start in time')
}

const server = spawn(process.execPath, ['.output/server/index.mjs'], {
  cwd: WEB,
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
server.stdout.on('data', (d) => (serverLog += d.toString()))
server.stderr.on('data', (d) => (serverLog += d.toString()))

try {
  const landing = await waitForServer()
  const landingHtml = await landing.text()

  const totalMatch = landingHtml.match(/共\s*(\d+)\s*篇/)
  const total = totalMatch ? Number(totalMatch[1]) : -1
  record(
    `⑫ 目录页报告篇数 = ${EXPECTED_CONTENT_ROUTES}`,
    total === EXPECTED_CONTENT_ROUTES,
    `实际 ${total}`,
  )
  record(
    `⑬ 5 组导航在 SSR 首屏都出现`,
    GROUP_LABELS.every((g) => landingHtml.includes(g)),
  )
  record(
    '⑭ 目录页没有「未索引」缺项（29 条 path 全部命中集合）',
    landing.status === 200 && !landingHtml.includes('未索引'),
  )
  record(
    '⑭b 目录页的 hero / features / 正文都取自 index.md（frontmatter 解析成功）',
    ['studyplan 全栈实战', '先横切，后纵切', '一条纪律'].every((t) => landingHtml.includes(t)),
  )

  let ok200 = 0
  const failures = []
  for (const p of contentPaths) {
    const r = await fetch(BASE + p, { redirect: 'manual' })
    const html = r.ok ? await r.text() : ''
    const hasH1 = /<h1[^>]*>/.test(html)
    if (r.status === 200 && hasH1) ok200 += 1
    else failures.push(`${p}(${r.status}${r.status === 200 ? ',无h1' : ''})`)
  }
  record(
    `⑮ ${EXPECTED_CONTENT_ROUTES} 条内容路由均 200 且 SSR 首屏含 <h1>`,
    ok200 === contentPaths.length,
    failures.join(', '),
  )
  record(
    `⑮b 内容路由总数 = ${EXPECTED_CONTENT_ROUTES}`,
    contentPaths.length === EXPECTED_CONTENT_ROUTES,
    `实际 ${contentPaths.length}`,
  )

  // 同名不同前缀：两套都取回各自正文，没有互相覆盖
  const s1 = await (await fetch(BASE + '/ebook/stages/stage-1')).text()
  const e1 = await (await fetch(BASE + '/ebook/exercises/stage-1')).text()
  record('⑯ stages/stage-1 是阶段正文', s1.includes('工程地基与 TypeScript 起步'))
  record('⑯b exercises/stage-1 是规划练习（未被 stages 吞掉）', e1.includes('规划练习 1'))

  // 本轮唯一的内容改动：正文里的内部链接必须落在 /ebook 下
  const absHrefs = [...s1.matchAll(/href="(\/[^"#]*)"?/g)].map((m) => m[1])
  const badAbsHref = absHrefs.filter(
    (h) => /^\/(guide|stages|exercises|design)\//.test(h) && !h.startsWith('/ebook/'),
  )
  record(
    '⑰ 正文根绝对链接都带 /ebook 前缀（href 实测，不是只看源文件）',
    badAbsHref.length === 0,
    badAbsHref.join(', '),
  )

  const rel = await (await fetch(BASE + '/ebook/guide/deployment-lessons')).text()
  const relOk =
    !rel.match(/href="\.\/debugging-lessons"/) &&
    rel.includes('href="/ebook/guide/debugging-lessons"')
  record('⑱ 相对链接 ./debugging-lessons 解析成 /ebook/guide/debugging-lessons', relOk)

  if (WITH_REDIRECTS) {
    for (const [oldPath, expected] of [
      ['/stages/stage-1', '/ebook/stages/stage-1'],
      ['/exercises/stage-3', '/ebook/exercises/stage-3'],
      ['/design/brand', '/ebook/design/brand'],
      ['/guide/roadmap', '/ebook/guide/roadmap'],
    ]) {
      const r = await fetch(BASE + oldPath, { redirect: 'manual' })
      const loc = r.headers.get('location') ?? ''
      record(
        `⑲ 旧路径 ${oldPath} → 301 ${expected}`,
        r.status === 301 && loc === expected,
        `status=${r.status} loc=${loc}`,
      )
    }
    let hop = 0
    let target = '/stages/stage-1'
    for (let i = 0; i < 5; i += 1) {
      const r = await fetch(BASE + target, { redirect: 'manual' })
      if (r.status !== 301) break
      target = r.headers.get('location')
      hop += 1
    }
    record('⑲e 重定向链只有一跳（无自环）', hop === 1, `跳数=${hop}`)
  } else {
    // 这一轮**必须**没有重定向：旧路径应该 404，而不是 307/301
    for (const oldPath of [
      '/stages/stage-1',
      '/guide/roadmap',
      '/design/brand',
      '/exercises/stage-3',
    ]) {
      const r = await fetch(BASE + oldPath, { redirect: 'manual' })
      record(
        `⑳ 重定向尚未启用：${oldPath} 不返回 3xx`,
        r.status >= 400 || r.status < 300,
        `status=${r.status}`,
      )
    }
    note('301 的 5 项检查', '本轮刻意未启用；内容迁移验证通过后加 --redirects 再跑')
  }
} catch (err) {
  record('运行期异常', false, String(err?.message ?? err))
  console.log('--- server log ---\n' + serverLog)
} finally {
  server.kill('SIGTERM')
}

const failed = results.filter((r) => !r.ok)
console.log(
  `\n合计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`,
)
process.exit(failed.length === 0 ? 0 : 1)
