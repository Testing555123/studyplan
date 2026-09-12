#!/usr/bin/env node
/**
 * 构建期代码索引生成器。
 *
 * ── 它解决什么问题 ──
 * AI 助手要能回答"这段本站代码为什么这样写"。但**运行层没有源码**：
 * `Dockerfile.vercel` 明确"只搬构建产物，不搬源码"（镜像里没有 .ts / .vue）。
 * 所以运行时去读文件这条路是死的，必须在**构建期**把代码信息抽出来，
 * 做成一个 JSON 塞进镜像，运行时只读这个 JSON。
 *
 * ── 为什么不用向量检索 ──
 * 那需要嵌入模型 + 向量库，是两套新依赖，与本项目"最少技术栈"的底线冲突。
 * 而这里的文件数量有限、且**注释密度极高** —— 注释本身就是最好的摘要，
 * 关键词匹配 + 注释摘要已经足够准，成本却几乎为零。
 *
 * 用法（在仓库根执行，且必须在 api 构建之后）：
 *   node scripts/generate-code-index.mjs
 */

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 仓库根（本脚本位于 scripts/ 下，往上退一层） */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 要扫描的目录。
 *
 * 只扫源码，不扫配置与产物 —— 后者对"理解代码"没有帮助，
 * 只会把索引撑大、并让关键词匹配命中一堆无关文件。
 */
const SCAN_DIRS = ['apps/api/src', 'apps/web/app', 'packages/shared/src']

/** 命中的文件扩展名 */
const EXTENSIONS = ['.ts', '.vue', '.mjs']

/** 目录名黑名单（出现在路径任意层级即跳过） */
const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  '.output',
  '.nuxt',
  '.vitepress',
  '.data',
  'coverage',
])

/** 单文件摘要的最大字符数 */
const SUMMARY_MAX_CHARS = 300

/** 单个文件最多记录多少个导出符号 */
const EXPORTS_MAX = 15

/** 输出路径：放进 api 的 dist，这样会随 dist 一起被 COPY 进运行层 */
const OUTPUT_PATH = join(ROOT, 'apps', 'api', 'dist', 'code-index.json')

/** 递归收集源文件 */
function collectFiles(dir, acc = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    // 目录不存在（比如 apps/web 没被构建过）就跳过，不影响其它目录
    return acc
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue
      collectFiles(fullPath, acc)
      continue
    }

    if (EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      acc.push(fullPath)
    }
  }

  return acc
}

/**
 * 提取导出符号。
 *
 * 用正则而不是真正的 AST 解析：后者要引入 parser 依赖，
 * 而这里只需要"大概有哪些公开符号"来辅助关键词匹配，
 * 漏掉一两个、或多抓几个，都不会影响最终效果。
 */
function extractExports(content) {
  const pattern =
    /^export\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|function|const|let|var|interface|type|enum)\s+([A-Za-z0-9_]+)/gm

  const names = new Set()
  let match
  while ((match = pattern.exec(content)) !== null) {
    names.add(match[1])
    if (names.size >= EXPORTS_MAX) break
  }
  return [...names]
}

/** 把注释文本压成一行可读的话 */
function cleanComment(raw) {
  return raw
    .split('\n')
    .map((line) => line.replace(/^\s*\*+\/?/, '').replace(/^\s*\/\/+/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 提取文件开头的说明性注释。
 *
 * 为什么只看开头？因为本项目有个极好的习惯：
 * **每个文件顶部都有一大段解释"这个文件是干什么的、为什么这样设计"**。
 * 这段注释的质量远高于任何自动生成的摘要。
 */
function extractSummary(content) {
  // 只看前 3000 字符：摘要一定在文件开头，不必全文扫描
  const head = content.slice(0, 3000)

  // 块注释 /* ... */ 或 /** ... */
  const block = head.match(/\/\*\*?([\s\S]*?)\*\//)
  if (block?.[1]) return cleanComment(block[1]).slice(0, SUMMARY_MAX_CHARS)

  // Vue 模板注释 <!-- ... -->
  const html = head.match(/<!--([\s\S]*?)-->/)
  if (html?.[1]) return cleanComment(html[1]).slice(0, SUMMARY_MAX_CHARS)

  // 连续的行注释
  const lines = head.split('\n')
  const commentLines = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('//')) {
      commentLines.push(trimmed)
    } else if (commentLines.length > 0) {
      // 已经收集到注释后遇到第一行代码就停，避免把代码里的零星注释也算进来
      break
    }
  }
  if (commentLines.length > 0) {
    return cleanComment(commentLines.join('\n')).slice(0, SUMMARY_MAX_CHARS)
  }

  return ''
}

/** 判断文件属于哪个包（用于前端展示与过滤） */
function detectPackage(relPath) {
  if (relPath.startsWith('apps/api')) return 'api'
  if (relPath.startsWith('apps/web')) return 'web'
  if (relPath.startsWith('packages/shared')) return 'shared'
  return 'other'
}

function main() {
  const files = SCAN_DIRS.flatMap((dir) => collectFiles(join(ROOT, dir)))

  const entries = []
  for (const file of files) {
    let content
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }

    // 路径统一用正斜杠：Windows 上生成的是反斜杠，
    // 直接存进 JSON 会让路径匹配在 Linux 容器里失效。
    const relPath = relative(ROOT, file).split(sep).join('/')

    const summary = extractSummary(content)
    const exports = extractExports(content)

    // 既没有注释也没有导出的文件，对"理解代码"几乎没有价值，跳过以控制体积
    if (!summary && exports.length === 0) continue

    entries.push({ path: relPath, pkg: detectPackage(relPath), exports, summary })
  }

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
  writeFileSync(OUTPUT_PATH, JSON.stringify(entries), 'utf8')

  const bytes = statSync(OUTPUT_PATH).size
  console.log(
    `[code-index] 已生成 ${entries.length} 条记录 → ${relative(ROOT, OUTPUT_PATH)}（${(bytes / 1024).toFixed(1)} KB）`,
  )
}

main()
