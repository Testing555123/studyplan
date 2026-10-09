/**
 * Spike：本地 Qwen3 0.6B 全套可行性验证（Embedding + Reranker）。
 *
 * 两级（可单独或同时开启）：
 *   1. 默认（不设环境变量）：只检查推理后端，不下载模型
 *   2. EMBED_DOWNLOAD=1   真实跑 Qwen3-Embedding 嵌入（验证维度 1024 与语义方向）
 *   3. RERANK_DOWNLOAD=1  真实跑 Qwen3-Reranker 重排（验证生成式打分与排序方向）
 *
 * 默认模型（与 lib/embeddings.ts、lib/rerank.ts 一致）：
 *   - onnx-community/Qwen3-Embedding-0.6B-ONNX（1024 维，对齐 vector(1024)）
 *   - onnx-community/Qwen3-Reranker-0.6B-ONNX（生成式 yes/no 打分）
 *
 * 注意（D9 三个坑）：用 onnx-community/*-ONNX 而非非 ONNX 原仓；
 * transformers.js v4 用 dtype:'q8'（禁用会被静默忽略的 quantized:true）；
 * 模型缓存 node_modules/.pnpm/.cache/ 会被 pnpm 清空，Docker 须显式拷进镜像层。
 */
import { pipeline, AutoTokenizer, AutoModelForCausalLM } from '@huggingface/transformers'

const EMBED_MODEL = process.env.EMBED_MODEL ?? 'onnx-community/Qwen3-Embedding-0.6B-ONNX'
const EMBED_DTYPE = process.env.EMBED_DTYPE ?? 'q8'
const RERANK_MODEL = process.env.RERANK_MODEL ?? 'onnx-community/Qwen3-Reranker-0.6B-ONNX'
const RERANK_DTYPE = process.env.RERANK_DTYPE ?? 'q8'

const started = Date.now()
console.log('[spike] transformers.js 已加载')

if (!process.env.EMBED_DOWNLOAD && !process.env.RERANK_DOWNLOAD) {
  console.log('[spike] 跳过模型下载（设置 EMBED_DOWNLOAD=1 / RERANK_DOWNLOAD=1 可跑真实验证）')
  console.log(`[spike] 计划使用的嵌入模型：${EMBED_MODEL} / dtype=${EMBED_DTYPE}`)
  console.log(`[spike] 计划使用的重排模型：${RERANK_MODEL} / dtype=${RERANK_DTYPE}`)
  console.log('[spike] 结论：推理后端可用，真实推理待单独验证')
  process.exit(0)
}

if (process.env.EMBED_DOWNLOAD) {
  await runEmbed()
}
if (process.env.RERANK_DOWNLOAD) {
  await runRerank()
}

console.log(`[spike] 总耗时：${Date.now() - started} ms`)

async function runEmbed() {
  const t0 = Date.now()
  const extractor = await pipeline('feature-extraction', EMBED_MODEL, { dtype: EMBED_DTYPE })
  // Qwen3-Embedding 需 left padding，才能正确取序列末 token 的隐状态。
  if (extractor.tokenizer && 'padding_side' in extractor.tokenizer) {
    extractor.tokenizer.padding_side = 'left'
  }
  console.log(`[spike] 嵌入模型加载完成：${Date.now() - t0} ms`)

  const QUERY_INSTRUCTION = 'Represent the query for retrieving relevant passages: '
  const DOC_INSTRUCTION = 'Represent the document for retrieval: '
  const query = QUERY_INSTRUCTION + '学习路线怎么制定？'
  const related = DOC_INSTRUCTION + '制定学习路线需要先明确目标，再拆解阶段与里程碑。'
  const unrelated = DOC_INSTRUCTION + '今天天气晴朗，适合去公园散步。'

  const t1 = Date.now()
  const out = await extractor([query, related, unrelated], { pooling: 'last_token', normalize: true })
  console.log(`[spike] 3 条文本嵌入完成：${Date.now() - t1} ms`)
  console.log(`[spike] 维度：${out.dims}`)

  const [q, r, u] = out.tolist()
  const sim = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0)
  const simRel = sim(q, r)
  const simUnrel = sim(q, u)
  console.log(`[spike] 相关对相似度：${simRel.toFixed(4)}`)
  console.log(`[spike] 无关对相似度：${simUnrel.toFixed(4)}`)

  const dim = out.dims[out.dims.length - 1]
  if (dim !== 1024) {
    console.error(`[spike][FAIL] 嵌入维度 ${dim} ≠ 1024，与 vector(1024) 不匹配，需改表或换模型`)
    process.exit(1)
  }
  if (simRel <= simUnrel) {
    console.error('[spike][FAIL] 相关对相似度未高于无关对，请检查 pooling/指令格式')
    process.exit(1)
  }
  console.log('[spike] 嵌入维度对齐 1024，且语义方向正确（相关 > 无关）✅')
}

async function runRerank() {
  const t0 = Date.now()
  const tokenizer = await AutoTokenizer.from_pretrained(RERANK_MODEL)
  const model = await AutoModelForCausalLM.from_pretrained(RERANK_MODEL, { dtype: RERANK_DTYPE })
  const yesId = tokenizer.convert_tokens_to_ids('yes')
  const noId = tokenizer.convert_tokens_to_ids('no')
  console.log(`[spike] 重排模型加载完成：${Date.now() - t0} ms；yes/no token id=${yesId}/${noId}`)
  if (yesId < 0 || noId < 0) {
    console.error('[spike][FAIL] 无法解析 yes/no token id')
    process.exit(1)
  }

  const SYSTEM_PROMPT =
    'Judge whether the Document meets the requirements based on the Query and the Instruct provided. ' +
    'Note that the answer can only be "yes" or "no".'
  const instruction = 'Given a web search query, retrieve relevant passages that answer the query'
  const buildPrompt = (query, doc) =>
    `<|im_start|>system\n${SYSTEM_PROMPT}<|im_end|>\n` +
    `<|im_start|>user\n<Instruct>: ${instruction}\n\n<Query>: ${query}\n\n<Document>: ${doc}<|im_end|>\n` +
    `<|im_start|>assistant\n<think>\n\n</think>\n`

  async function scoreDocument(query, doc) {
    const inputs = tokenizer(buildPrompt(query, doc), { truncation: true, max_length: 8192 })
    const output = await model(inputs)
    const logits = output.logits
    const seqLen = logits.dims[1]
    const vocabSize = logits.dims[2]
    const last = logits.data.subarray((seqLen - 1) * vocabSize, seqLen * vocabSize)
    const yes = Math.exp(last[yesId])
    const no = Math.exp(last[noId])
    return yes / (yes + no)
  }

  const query = '学习路线怎么制定？'
  const documents = [
    '制定学习路线需要先明确目标，再拆解阶段与里程碑。', // 相关，应排前
    '今天天气晴朗，适合去公园散步。', // 无关
    '路线图建议先学基础语法，再做小项目巩固，最后深入原理。', // 相关
  ]

  const t1 = Date.now()
  const scores = []
  for (const doc of documents) scores.push(await scoreDocument(query, doc))
  console.log(`[spike] ${documents.length} 条重排完成：${Date.now() - t1} ms`)
  const ranked = documents
    .map((doc, i) => ({ i, doc, score: scores[i] }))
    .sort((a, b) => b.score - a.score)
  ranked.forEach((r) => console.log(`[spike]   score=${r.score.toFixed(4)}  ${r.doc}`))

  if (ranked[0].i !== 0 && ranked[0].i !== 2) {
    console.error('[spike][FAIL] 最相关文档未排到首位，请检查打分逻辑')
    process.exit(1)
  }
  console.log('[spike] 重排语义方向正确（相关文档排前）✅')
}
