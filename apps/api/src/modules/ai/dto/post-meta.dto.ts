import { z } from 'zod'
import { MAX_TAGS_PER_POST } from '@studyplan/shared'

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
export const postMetaSchema = z.object({
  /** 一句话摘要。上限 200 字，超过就截断（见 ai.service.ts 的 sanitize） */
  summary: z.string().min(1).max(200),

  /**
   * 推荐标签。
   *
   * 这里只约束**数量与类型**，不约束"必须是白名单里的值" ——
   * 因为把 10 个标签白名单塞进 Schema 描述会让 Prompt 变得啰嗦，
   * 而"过滤非法标签"是纯逻辑，放在代码里做更可靠、也更好测试。
   *
   * > 一条经验：**能用代码确定的规则，不要交给模型去遵守。**
   * > Schema 用来约束"形状"，白名单校验用来约束"取值"。
   */
  tags: z.array(z.string()).min(1).max(MAX_TAGS_PER_POST),
})

/** 由 Schema 推导出的类型 —— 全程唯一的那份定义 */
export type PostMeta = z.infer<typeof postMetaSchema>
