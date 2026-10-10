/**
 * 本地文本嵌入封装 —— Qwen3-Embedding-0.6B（ONNX / transformers.js）。
 *
 * 设计约束（详见 docs/DECISIONS.md D9、D15）：
 *  - 模型在 Node 侧本地推理，仅用于独立脚本/后台 job，绝不进入请求路径；
 *  - 单例懒加载，进程内只加载一次（权重 ~300MB，冷加载 ~18s）；
 *  - 维度 1024，与 pgvector `vector(1024)` 精确对齐，无需改表；
 *  - transformers.js v4 用 `dtype: 'q8'`（禁用会被静默忽略的 `quantized: true`）；
 *  - 加载/推理失败抛出明确错误，供上层「降级到 LLM+网络搜索」捕获（不变量 V5）。
 *
 * Qwen3-Embedding 是 Decoder-only 因果 LM，取**最后一个 token** 的隐状态作为句向量，
 * 因此必须 left padding（否则末 token 会是 pad，向量失真）。pooling 固定 'last_token'。
 */
import { existsSync } from 'node:fs'
import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers'

/**
 * 模型缓存/离线加载配置（方案 B，详见 docs/DECISIONS.md D18）。
 *  - MODEL_CACHE_DIR：权重落地目录，必须与预下载脚本（scripts/download-models.mjs）一致；
 *    默认 `.model-cache`（已在 .gitignore 忽略），避开会被 pnpm 清空的 node_modules 缓存。
 *  - LOCAL_MODELS_ONLY=1/true：禁止运行时联网，缺失即抛可行动错误（提示先 pnpm models:download）。
 *    env.cacheDir 在导入后立即设置，且 allowRemoteModels 仅在离线模式置 false。
 */
const MODEL_CACHE_DIR = process.env.MODEL_CACHE_DIR ?? '.model-cache'
const LOCAL_MODELS_ONLY =
  process.env.LOCAL_MODELS_ONLY === '1' || process.env.LOCAL_MODELS_ONLY === 'true'
env.cacheDir = MODEL_CACHE_DIR
if (LOCAL_MODELS_ONLY) env.allowRemoteModels = false

const EMBED_MODEL = process.env.EMBED_MODEL ?? 'onnx-community/Qwen3-Embedding-0.6B-ONNX'
const EMBED_DTYPE = (process.env.EMBED_DTYPE ?? 'q8') as 'q8' | 'fp16' | 'fp32' | 'int8'

/**
 * 解析模型标识：若 EMBED_MODEL 在磁盘存在则作为本地路径直载并强制离线；
 * 否则作为 HuggingFace repo id，离线模式下同样强制 local_files_only。
 */
function resolveModelSpec(repoOrDefault: string): { model: string; loadOpts: { local_files_only?: boolean } } {
  if (existsSync(repoOrDefault)) {
    return { model: repoOrDefault, loadOpts: { local_files_only: true } }
  }
  return { model: repoOrDefault, loadOpts: LOCAL_MODELS_ONLY ? { local_files_only: true } : {} }
}

/** 加载失败统一包装为可行动错误（指向 pnpm models:download），保留 V5 降级契约。 */
class ModelLoadError extends Error {
  constructor(kind: string, model: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    super(
      `本地模型加载失败（${kind}，模型 ${model}）：${detail}\n` +
        `若权重未下载或离线模式缺失，请先执行：pnpm models:download` +
        `（受限网络可设 HF_ENDPOINT=https://hf-mirror.com）。`,
    )
    this.name = 'ModelLoadError'
    this.cause = cause
  }
}

/** 固定输出维度，与 Drizzle schema 的 vector(1024) 一一对应。 */
export const EMBED_DIMENSION = 1024

/**
 * 官方检索指令（Qwen3-Embedding 技术报告推荐）。
 * query 与 document 使用不同指令可显著提升检索对齐度；中文/多语言场景同样适用。
 */
export const QUERY_INSTRUCTION = 'Represent the query for retrieving relevant passages: '
export const DOCUMENT_INSTRUCTION = 'Represent the document for retrieval: '

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const spec = resolveModelSpec(EMBED_MODEL)
      try {
        const extractor = await pipeline('feature-extraction', spec.model, {
          dtype: EMBED_DTYPE,
          ...spec.loadOpts,
        })
        // Qwen3-Embedding 需 left padding，才能正确取到序列末 token 的隐状态。
        if (extractor.tokenizer && 'padding_side' in extractor.tokenizer) {
          extractor.tokenizer.padding_side = 'left'
        }
        return extractor
      } catch (error) {
        throw new ModelLoadError('Qwen3-Embedding', spec.model, error)
      }
    })()
  }
  return extractorPromise
}

export interface EmbedOptions {
  /** 是否为查询文本（决定使用 query / document 指令前缀）。 */
  isQuery?: boolean
  /** 覆盖默认指令前缀；传空串 '' 表示不加任何指令。 */
  instruction?: string
}

function withInstruction(text: string, opts?: EmbedOptions): string {
  if (opts?.instruction !== undefined) return opts.instruction + text
  const instruction = opts?.isQuery ? QUERY_INSTRUCTION : DOCUMENT_INSTRUCTION
  return instruction + text
}

/**
 * 批量嵌入文本，返回 number[][]（每条 1024 维，L2 归一化）。
 * 空数组直接返回空，避免触发模型加载。
 */
export async function embedTexts(texts: string[], opts?: EmbedOptions): Promise<number[][]> {
  if (texts.length === 0) return []
  const extractor = await getExtractor()
  const inputs = texts.map((text) => withInstruction(text, opts))
  const output = await extractor(inputs, { pooling: 'last_token', normalize: true })
  return output.tolist() as number[][]
}

/** 嵌入单条查询，返回 1024 维向量（L2 归一化）。 */
export async function embedQuery(query: string, instruction?: string): Promise<number[]> {
  const [vector] = await embedTexts([query], { isQuery: true, instruction })
  return vector
}

/** 预热模型（独立脚本启动时调用，避免首次请求阻塞）。 */
export async function warmupEmbedder(sample = '预热用占位文本'): Promise<void> {
  await embedTexts([sample])
}
