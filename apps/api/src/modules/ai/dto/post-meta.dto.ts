/**
 * ⚠️ 本文件原先用 zod 定义结构化输出 Schema。
 * 移除 LangChain 依赖后不再需要 zod，改为纯类型 + 常量约束。
 * 真正的"取值合规"校验在 `utils/post-meta.sanitizer.ts`（它带单测，不依赖任何库）。
 *
 * 恢复 AI 能力时，可参照 Git 历史把 zod Schema 加回来：
 *   summary: z.string().min(1).max(200)
 *   tags: z.array(z.string()).min(1).max(MAX_TAGS_PER_POST)
 */

/**
 * AI 结构化输出的契约。
 *
 * ── 为什么必须用 Schema 约束，而不是"让它返回 JSON 然后 JSON.parse"？ ──
 *
 * 因为 LLM 的输出是**外部输入**，和用户提交的表单没有本质区别：
 * 都不可信，都可能不合规。
 *
 * 只写"请返回 JSON"的 Prompt，你会遇到这些问题：
 *   - 模型先说一句"好的，这是结果："再给 JSON；
 *   - 用 Markdown 代码块把 JSON 包起来；
 *   - 字段名写成了 `Summary` 而不是 `summary`；
 *   - tags 返回 8 个（你只要 5 个）；
 *   - 摘要写了 500 字（你只要一句话）。
 *
 * **前三个是"格式问题"，后两个是"格式对但内容不合规"。**
 * 两者都必须拦住 —— 而 Zod 的 `.max()` 正好同时覆盖这两类。
 *
 * `withStructuredOutput` 会把 Schema 转成模型的函数调用/JSON 模式约束，
 * 但**不要因此以为它一定成功**：不同模型的支持程度不同，
 * 所以解析失败的分支仍然必须存在（见 ai.service.ts）。
 */
/** 模型结构化输出的形状（恢复 AI 能力时，这就是 withStructuredOutput 要产出的结构） */
export interface PostMeta {
  /** 一句话摘要 */
  summary: string
  /** 推荐标签；取值合规性由 sanitizer 校验，这里只声明形状 */
  tags: string[]
}
