/** 拼进 prompt 的单帖正文截断。topK=8 时 8×500 字仍在安全预算内 */
const CONTENT_SNIPPET_MAX = 500

export interface AskPostsInput {
  question: string
  posts: Array<{ id: string; title: string; summary?: string | null; content: string }>
}

/**
 * 「问全书」的 prompt。
 * 三条硬要求各自拦一类失败：
 *   只依据资料 → 拦幻觉；[n] 标注 → 让答案可点回原文验证；
 *   资料不足明说 → 给模型一个「不知道」的合法出口，
 *   否则它宁可编也不会承认。
 */
export function buildAskPostsPrompt(input: AskPostsInput): string {
  const materials = input.posts
    .map((post, index) => {
      const summary = post.summary ? `\n摘要：${post.summary}` : ''
      const excerpt = post.content.slice(0, CONTENT_SNIPPET_MAX)
      return `[${index + 1}] ${post.title}${summary}\n内容节选：${excerpt}`
    })
    .join('\n\n')

  return [
    '你是 studyplan 学习社区的问答助手。请只依据下面提供的站内帖子资料回答问题。',
    '要求：',
    '1. 只依据资料回答，资料里没有的不要编造；',
    '2. 引用来源时使用 [1] [2] 这样的编号标记；',
    '3. 如果资料不足以支撑回答，直接说明「站内的帖子还没有覆盖这个问题」，不要硬编。',
    '4. 用简体中文回答，300 字以内。',
    '',
    '## 站内资料',
    materials,
    '',
    '## 问题',
    input.question,
  ].join('\n')
}
