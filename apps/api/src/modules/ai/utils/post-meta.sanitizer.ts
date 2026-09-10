import { AI_SUMMARY_MAX_LENGTH, MAX_TAGS_PER_POST, isPostTag, type AiPostMeta } from '@studyplan/shared'
import type { PostMeta } from '../dto/post-meta.dto'

/**
 * 只保留错误的"安全摘要"。
 *
 * ── 为什么不能直接 `console.error(error)`？ ──
 *
 * 因为出问题时你最想做的事就是"把整个错误打出来看看" ——
 * 而某些 HTTP 客户端在报错时会把**整个请求体**（包括请求头）附在
 * message 里。请求头里就可能有 `Authorization: Bearer <你的 API Key>`。
 *
 * 所以这里只取错误名 + 截断到 160 字符，调用处还会再经过
 * `redactApiKey()` 把密钥替换掉。两道防线。
 *
 * > 日志是排查问题的工具，同时也是**最容易泄漏密钥的地方**。
 * > 写日志时问自己一句："这行如果被贴到 issue 里，安全吗？"
 */
export function describeError(error: unknown): string {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return raw.length > 160 ? `${raw.slice(0, 160)}…` : raw
}

/** 把文本里出现的密钥替换掉。多一道防线总比事后补救便宜 */
export function redactApiKey(text: string, apiKey: string | null): string {
  if (!apiKey) return text
  return text.split(apiKey).join('***')
}

/**
 * 清洗模型返回的内容。
 *
 * ── 为什么要把这个函数单独放一个文件？ ──
 *
 * 因为它是一段**纯逻辑**：给同样的输入永远给同样的输出，
 * 不依赖网络、不依赖配置、不依赖时间。
 * 而它所在的 AiService 里全是网络 I/O。
 *
 * 混在一起的结果是：**这段最需要测试的逻辑反而测不了**
 * （要跑测试就得先 mock 一个 HTTP 客户端）。
 *
 * 拆出来之后，它可以被几十个边界用例覆盖，跑一次几十毫秒。
 *
 * > 一条很实用的重构经验：**把"纯逻辑"从"有副作用的方法"里拔出来。**
 * > 这是提升可测试性性价比最高的一个动作。
 *
 * ── 它具体在清洗什么？ ──
 *
 * **永远不要信任外部输入** —— 而 LLM 的输出就是外部输入。
 * 这段做的事和"清洗用户提交的表单"没有本质区别：
 *   1. 去掉空白、丢掉空摘要；
 *   2. 用白名单过滤标签（模型很爱自己造标签，比如把 "Vue" 写成 "Vue3"）；
 *   3. 去重（同一个标签可能被推荐两次）；
 *   4. 截断超长内容（模型偶尔会把 60 字写成 300 字）。
 *
 * 任何一条不满足就返回 null，让上层当作"没有 AI 结果"处理。
 */
export function sanitizePostMeta(raw: PostMeta): AiPostMeta | null {
  const summary = raw.summary?.trim() ?? ''
  if (!summary) return null

  const tags = [...new Set(raw.tags.map((tag) => tag.trim()))]
    .filter(isPostTag)
    .slice(0, MAX_TAGS_PER_POST)

  /**
   * 标签全被过滤掉时，整个结果都不用 —— 只有摘要没有标签的
   * "半成品"会让界面看起来很怪，而且往往意味着模型根本没理解任务。
   */
  if (tags.length === 0) return null

  return {
    summary:
      summary.length > AI_SUMMARY_MAX_LENGTH
        ? `${summary.slice(0, AI_SUMMARY_MAX_LENGTH - 1)}…`
        : summary,
    tags,
  }
}
