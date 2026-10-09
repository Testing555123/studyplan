/**
 * 本地重排序封装 —— Qwen3-Reranker-0.6B（ONNX / transformers.js）。
 *
 * 重要：Qwen3-Reranker 是**生成式重排序器**，不能用 `pipeline('text-ranking')`（那套面向传统
 * cross-encoder 单 logit 输出）。它本质是一个 Causal LM，通过对 `<Query>/<Document>` 拼接后的
 * 首生成 token 的 yes/no 概率做归一化打分（详见 onnx-community/Qwen3-Reranker-0.6B-ONNX 官方示例）。
 *
 * 设计约束（docs/DECISIONS.md D9、D15）：
 *  - 仅用于独立脚本/后台 job，绝不进入请求路径；
 *  - 单例懒加载，进程内只加载一次（权重 ~300MB，冷加载 ~18s）；
 *  - 串行推理：模型为 stateful，并发调用会污染 KV cache 状态，故逐文档前向；
 *  - 加载/推理失败抛出明确错误，供上层「降级到 LLM+网络搜索」捕获（不变量 V5）。
 *
 * score 含义：yes/(yes+no) 的归一化概率，范围 (0,1)，越大越相关。
 */
import {
  AutoTokenizer,
  AutoModelForCausalLM,
  type PreTrainedTokenizer,
  type PreTrainedModel,
} from '@huggingface/transformers'

const RERANK_MODEL = process.env.RERANK_MODEL ?? 'onnx-community/Qwen3-Reranker-0.6B-ONNX'
const RERANK_DTYPE = (process.env.RERANK_DTYPE ?? 'q8') as 'q8' | 'q4' | 'int8' | 'fp16' | 'fp32'

const SYSTEM_PROMPT =
  'Judge whether the Document meets the requirements based on the Query and the Instruct provided. ' +
  'Note that the answer can only be "yes" or "no".'

/** 默认检索指令（官方通用网页检索指令）。中文/代码等场景可覆盖。 */
const DEFAULT_INSTRUCTION = 'Given a web search query, retrieve relevant passages that answer the query'

interface Reranker {
  tokenizer: PreTrainedTokenizer
  model: PreTrainedModel
  yesId: number
  noId: number
}

let rerankerPromise: Promise<Reranker> | null = null

function getReranker(): Promise<Reranker> {
  if (!rerankerPromise) {
    rerankerPromise = (async () => {
      const tokenizer = await AutoTokenizer.from_pretrained(RERANK_MODEL)
      const model = await AutoModelForCausalLM.from_pretrained(RERANK_MODEL, { dtype: RERANK_DTYPE })
      const yesId = tokenizer.convert_tokens_to_ids('yes')
      const noId = tokenizer.convert_tokens_to_ids('no')
      if (typeof yesId !== 'number' || typeof noId !== 'number' || yesId < 0 || noId < 0) {
        throw new Error(`Qwen3-Reranker 无法解析 yes/no token id（${yesId}/${noId}），请检查模型权重`)
      }
      return { tokenizer, model, yesId, noId }
    })()
  }
  return rerankerPromise
}

function buildPrompt(query: string, doc: string, instruction: string): string {
  return (
    `<|im_start|>system\n${SYSTEM_PROMPT}<|im_end|>\n` +
    `<|im_start|>user\n<Instruct>: ${instruction}\n\n<Query>: ${query}\n\n<Document>: ${doc}<|im_end|>\n` +
    `<|im_start|>assistant\n<think>\n\n</think>\n`
  )
}

async function scoreDocument(
  reranker: Reranker,
  query: string,
  doc: string,
  instruction: string,
): Promise<number> {
  const prompt = buildPrompt(query, doc, instruction)
  const inputs = reranker.tokenizer(prompt, { truncation: true, max_length: 8192 })
  const output = await reranker.model(inputs)
  const logits = (output as { logits: { dims: number[]; data: Float32Array } }).logits
  const seqLen = logits.dims[1]
  const vocabSize = logits.dims[2]
  const lastLogits = logits.data.subarray((seqLen - 1) * vocabSize, seqLen * vocabSize)
  const yesScore = Math.exp(lastLogits[reranker.yesId])
  const noScore = Math.exp(lastLogits[reranker.noId])
  return yesScore / (yesScore + noScore)
}

export interface RankedItem {
  /** 原始 documents 数组下标，便于上层映射回 chunk id。 */
  index: number
  /** yes/(yes+no) 归一化概率，范围 (0,1)。 */
  score: number
}

export interface RerankOptions {
  instruction?: string
}

/**
 * 对候选文档做生成式重排序。
 * @returns 按相关性降序排列的 { index(原始下标), score } 列表。
 */
export async function rerank(
  query: string,
  documents: string[],
  opts?: RerankOptions,
): Promise<RankedItem[]> {
  if (documents.length === 0) return []
  const reranker = await getReranker()
  const instruction = opts?.instruction ?? DEFAULT_INSTRUCTION
  const scores: number[] = []
  for (let i = 0; i < documents.length; i++) {
    scores.push(await scoreDocument(reranker, query, documents[i], instruction))
  }
  return documents
    .map((_, index) => ({ index, score: scores[index] }))
    .sort((a, b) => b.score - a.score)
}

/** 预热模型（独立脚本启动时调用，避免首次请求阻塞）。 */
export async function warmupReranker(sample = '预热占位文档'): Promise<void> {
  await rerank('预热查询', [sample])
}
