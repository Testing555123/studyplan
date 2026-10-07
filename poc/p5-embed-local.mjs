/**
 * 缺口 #5「embed 待独立方案」PoC —— 本地嵌入
 * ===================================================================
 * 裁定（用户 2026-10-08 确认）：采用 @huggingface/transformers 本地推理。
 *
 * 为什么要这个 PoC：
 *   TECH-SELECTION.md 判定 OpenCode Zen 无 /embeddings 端点（已核实），
 *   embed 因此成为悬空缺口。本脚本验证本地方案能否满足三条硬指标：
 *     ① 维度 = 1024（必须与现状 postembeddings.vector(1024) 对齐，否则要改表）
 *     ② 中文语义可用（相关句对相似度显著高于无关句对）
 *     ③ 输出已 L2 归一化（现状写入口径是归一化后存 vector）
 *
 * ⚠️ 模型选择的关键修正（实时核实 HF API 得出）：
 *   `BAAI/bge-large-zh-v1.5` 的 tags 里**没有 onnx**，transformers.js 无法直接加载；
 *   必须用它官方的 transformers.js 转换版 **`Xenova/bge-large-zh-v1.5`**
 *   （library_name: transformers.js，tags 含 onnx，base_model 指向 BAAI/bge-large-zh-v1.5）。
 *   维度同为 1024，中文效果一致，只是权重被转成了 ONNX 并量化。
 *
 * 运行：node poc/p5-embed-local.mjs
 */

import { pipeline } from '@huggingface/transformers'

const MODEL_ID = process.env.EMBED_MODEL ?? 'Xenova/bge-large-zh-v1.5'

// 中文语义对照：前两组是「应当相关」，第三组是「应当不相关」
const PAIRS = [
  { a: '如何学习 TypeScript 的类型系统', b: 'TypeScript 类型体操入门指南', expect: 'similar' },
  { a: '数据库连接池耗尽怎么办', b: 'PostgreSQL 连接数被打满的排查', expect: 'similar' },
  { a: '如何学习 TypeScript 的类型系统', b: '今天中午吃什么', expect: 'dissimilar' },
]

function cosine(x, y) {
  let dot = 0
  let nx = 0
  let ny = 0
  for (let i = 0; i < x.length; i += 1) {
    dot += x[i] * y[i]
    nx += x[i] * x[i]
    ny += y[i] * y[i]
  }
  return dot / (Math.sqrt(nx) * Math.sqrt(ny) || 1)
}

function l2norm(x) {
  return Math.sqrt(x.reduce((s, v) => s + v * v, 0))
}

/**
 * transformers.js v4 用 `dtype` 选择权重量化档位，不再是 v2 的 `quantized: true`
 * —— 实测 `quantized: true` 会被**静默忽略**并回退到 fp32（缓存里只有 1,238 MB 的 model.onnx，
 *    而仓库实际提供了 model_quantized / fp16 / int8 / q4 / q4f16 等档位）。
 *    这个静默回退很危险：你以为在用 300 MB 的量化版，实际在下载 1.2 GB。
 *
 * 为什么必须量化：fp32 版 1,238 MB，进镜像就撑大 1.2 GB；
 * 不预置则每次冷启动都要重新下载（实测首次 82.7s，其中约 79s 是下载）。
 */
const DTYPE = process.env.EMBED_DTYPE ?? 'fp32'

const t0 = Date.now()
const extractor = await pipeline('feature-extraction', MODEL_ID, {
  dtype: DTYPE,
  progress_callback: null,
})
const loadMs = Date.now() - t0
console.log(`模型加载耗时: ${loadMs} ms  (${MODEL_ID}, dtype=${DTYPE})`)

const texts = PAIRS.flatMap((p) => [p.a, p.b])
const t1 = Date.now()
const out = await extractor(texts, { pooling: 'mean', normalize: true })
const embedMs = Date.now() - t1

const dim = out.dims.at(-1)
const vectors = []
for (let i = 0; i < texts.length; i += 1) {
  const row = out[i] ?? out
  vectors.push(Array.from(row.tolist ? row.tolist() : row.data ?? row))
}

console.log(`批量 ${texts.length} 条嵌入耗时: ${embedMs} ms`)
console.log(`维度: ${dim}`)

const results = []
let normOk = true
for (let i = 0; i < vectors.length; i += 1) {
  const n = l2norm(vectors[i])
  if (Math.abs(n - 1) > 0.02) normOk = false
}

console.log(`L2 范数 ≈ 1（全部）: ${normOk ? 'YES' : 'NO'}`)

for (let i = 0; i < PAIRS.length; i += 1) {
  const s = cosine(vectors[i * 2], vectors[i * 2 + 1])
  results.push({ ...PAIRS[i], sim: s })
  console.log(`  [${PAIRS[i].expect.padEnd(10)}] ${s.toFixed(4)}  «${PAIRS[i].a}» vs «${PAIRS[i].b}»`)
}

const sims = results.filter((r) => r.expect === 'similar').map((r) => r.sim)
const dis = results.filter((r) => r.expect === 'dissimilar').map((r) => r.sim)
const minSim = Math.min(...sims)
const maxDis = Math.max(...dis)

console.log('')
console.log('=== 判定 ===')
console.log(`① 维度 = 1024            : ${dim === 1024 ? 'PASS' : `FAIL (${dim})`}`)
console.log(`② 相关 > 无关             : ${minSim > maxDis ? 'PASS' : 'FAIL'}  (min相关=${minSim.toFixed(4)} > max无关=${maxDis.toFixed(4)})`)
console.log(`③ 相关对 > 0.7            : ${minSim > 0.7 ? 'PASS' : 'FAIL'}`)
console.log(`④ L2 归一化               : ${normOk ? 'PASS' : 'FAIL'}`)
console.log(`⑤ 单条均值耗时            : ${(embedMs / texts.length).toFixed(1)} ms`)

const ok = dim === 1024 && minSim > maxDis && minSim > 0.7 && normOk
console.log(`\n总体: ${ok ? 'PASS — 本地嵌入方案可行' : 'FAIL'}`)
process.exit(ok ? 0 : 1)
