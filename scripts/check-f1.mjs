// F1: SPEC §9 --md-sys-color-* 与语义 token 在 :root 与 .dark 成对出现。
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

function block(name) {
  const re = new RegExp(`${name}\\s*\\{([\\s\\S]*?)\\n\\}`)
  const m = css.match(re)
  return m ? m[1] : null
}

const root = block(':root')
const dark = block('.dark')
if (!root || !dark) {
  console.error('FAIL: 未找到 :root 或 .dark 块')
  process.exit(1)
}

function tokens(str) {
  const map = new Map()
  for (const line of str.split('\n')) {
    const m = line.match(/^\s*(--[\w-]+)\s*:\s*([^;]+);/)
    if (m) map.set(m[1], m[2].trim())
  }
  return map
}

const r = tokens(root)
const d = tokens(dark)

// 仅校验颜色类 token（--md-sys-color-* 与语义色）
const colorKeys = [...r.keys()].filter(
  (k) => k.startsWith('--md-sys-color-') || ['--ring', '--border', '--input', '--muted', '--popover', '--destructive', '--success', '--warning'].includes(k),
)

let fail = 0
for (const k of colorKeys) {
  if (!d.has(k)) {
    console.error(`FAIL: ${k} 在 .dark 中缺失`)
    fail++
    continue
  }
  if (r.get(k) === d.get(k)) {
    console.error(`WARN: ${k} 浅/深色值相同（非镜像）：${r.get(k)}`)
  }
}

console.log(`F1 校验：:root 颜色 token ${colorKeys.length} 个，.dark 缺失 ${fail} 个`)
// 镜像素：dark 不应有 :root 没有的颜色 key（反向）
const extra = [...d.keys()].filter((k) => colorKeys.includes(k) === false && (k.startsWith('--md-sys-color-') || k.startsWith('--color-')))
if (extra.length) {
  console.error(`WARN: .dark 含 :root 未定义的颜色 token：${extra.join(', ')}`)
}

process.exit(fail ? 1 : 0)
