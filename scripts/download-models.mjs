/**
 * 本地模型（Qwen3-Embedding / Qwen3-Reranker ONNX）一次性预下载脚本（方案 B）。
 *
 * 设计要点：
 *  - 在**导入 transformers 之前**注入 `HF_ENDPOINT` 镜像与 `env.cacheDir`，确保下载走镜像、
 *    且落到与运行时完全一致的 `.model-cache/` 目录，离线加载可被精确命中（避免手动 snapshot
 *    抓错文件名/变体的风险）。
 *  - 复用 transformers.js 自身的 `pipeline` / `AutoModelForCausalLM`，触发与运行时**完全一致**
 *    的文件解析与下载路径；下载的是 q8 权重，与 lib/embeddings.ts、lib/rerank.ts 的 dtype 对齐。
 *  - 本脚本是「一次性」行为（约 600MB 权重载入内存），仅用于构建期/本地预拉取，绝不进请求路径。
 *
 * 用法：
 *   pnpm models:download                       # 走默认镜像 hf-mirror.com 下载到 .model-cache
 *   HF_ENDPOINT=https://hf-mirror.com node scripts/download-models.mjs
 *   MODEL_CACHE_DIR=/data/models node scripts/download-models.mjs
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// 1) 镜像：受限网络（huggingface.co 不可达）时走镜像；可设空串强制直连官方源。
const HF_ENDPOINT = process.env.HF_ENDPOINT ?? 'https://hf-mirror.com'
if (HF_ENDPOINT) {
  process.env.HF_ENDPOINT = HF_ENDPOINT
}

// 2) 缓存目录：必须与运行时 lib/embeddings.ts、lib/rerank.ts 的 MODEL_CACHE_DIR 一致。
const MODEL_CACHE_DIR = process.env.MODEL_CACHE_DIR ?? '.model-cache'
const cacheDir = resolve(MODEL_CACHE_DIR)
if (!existsSync(cacheDir)) {
  console.log(`[download] 缓存目录不存在，将创建：${cacheDir}`)
}

// 3) 在导入 transformers 之前设置 cacheDir（env 是单例，早设早生效）。
const { env } = await import('@huggingface/transformers')
env.cacheDir = cacheDir
// 下载阶段允许远程（=true）；仅离线加载时运行时才会置 false。
env.allowRemoteModels = true

const EMBED_MODEL = process.env.EMBED_MODEL ?? 'onnx-community/Qwen3-Embedding-0.6B-ONNX'
const EMBED_DTYPE = process.env.EMBED_DTYPE ?? 'q8'
const RERANK_MODEL = process.env.RERANK_MODEL ?? 'onnx-community/Qwen3-Reranker-0.6B-ONNX'
const RERANK_DTYPE = process.env.RERANK_DTYPE ?? 'q8'

const source = HF_ENDPOINT ? `镜像 ${HF_ENDPOINT}` : '官方源 huggingface.co'
console.log(`[download] 模型源：${source}`)
console.log(`[download] 缓存目录：${cacheDir}`)
console.log(`[download] 嵌入模型：${EMBED_MODEL} / dtype=${EMBED_DTYPE}`)
console.log(`[download] 重排模型：${RERANK_MODEL} / dtype=${RERANK_DTYPE}`)

const started = Date.now()

async function downloadEmbedding() {
  const t0 = Date.now()
  console.log(`[download] 开始下载嵌入模型（${EMBED_MODEL}）…`)
  const { pipeline } = await import('@huggingface/transformers')
  const extractor = await pipeline('feature-extraction', EMBED_MODEL, { dtype: EMBED_DTYPE })
  // 顺手做一次轻量前向，确保 tokenizer + 权重文件都被解析命中（缓存完整）。
  if (extractor.tokenizer && 'padding_side' in extractor.tokenizer) {
    extractor.tokenizer.padding_side = 'left'
  }
  await extractor(['Represent the document for retrieval: 预热占位文本'], {
    pooling: 'last_token',
    normalize: true,
  })
  console.log(`[download] 嵌入模型就绪：${Date.now() - t0} ms`)
}

async function downloadReranker() {
  const t0 = Date.now()
  console.log(`[download] 开始下载重排模型（${RERANK_MODEL}）…`)
  const { AutoTokenizer, AutoModelForCausalLM } = await import('@huggingface/transformers')
  const tokenizer = await AutoTokenizer.from_pretrained(RERANK_MODEL)
  const model = await AutoModelForCausalLM.from_pretrained(RERANK_MODEL, { dtype: RERANK_DTYPE })
  const yesId = tokenizer.convert_tokens_to_ids('yes')
  if (typeof yesId !== 'number' || yesId < 0) {
    throw new Error(`[download] 重排模型无法解析 yes token id（${yesId}），权重可能不完整`)
  }
  // 轻量前向，确保权重文件被完整加载到缓存。
  const prompt = '<|im_start|>user\n<Document>: 预热占位文档<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n'
  const inputs = tokenizer(prompt, { truncation: true, max_length: 8192 })
  await model(inputs)
  console.log(`[download] 重排模型就绪：${Date.now() - t0} ms`)
}

try {
  await downloadEmbedding()
  await downloadReranker()
  console.log(`[download] 全部完成，总耗时 ${Date.now() - started} ms`)
  console.log(`[download] 缓存已固化于 ${cacheDir}，运行时设置 LOCAL_MODELS_ONLY=1 可离线加载。`)
  process.exit(0)
} catch (error) {
  console.error('[download] 失败：', error)
  console.error(
    '[download] 排查：① 检查网络/镜像可达性；② 确认 HF_ENDPOINT 镜像地址；' +
      '③ 设置 MODEL_CACHE_DIR 与运行时一致；④ 手动下载见 docs/DECISIONS.md D18。',
  )
  process.exit(1)
}
