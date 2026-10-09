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
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'

const EMBED_MODEL = process.env.EMBED_MODEL ?? 'onnx-community/Qwen3-Embedding-0.6B-ONNX'
const EMBED_DTYPE = (process.env.EMBED_DTYPE ?? 'q8') as 'q8' | 'fp16' | 'fp32' | 'int8'

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
    extractorPromise = pipeline('feature-extraction', EMBED_MODEL, { dtype: EMBED_DTYPE }).then(
      (extractor) => {
        // Qwen3-Embedding 需 left padding，才能正确取到序列末 token 的隐状态。
        if (extractor.tokenizer && 'padding_side' in extractor.tokenizer) {
          extractor.tokenizer.padding_side = 'left'
        }
        return extractor
      },
    )
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
