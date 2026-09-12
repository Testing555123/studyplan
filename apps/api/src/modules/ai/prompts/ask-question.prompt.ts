/** 送进模型的本站代码片段总长度上限（字符） */
const MAX_SNIPPET_TOTAL_CHARS = 6000

/**
 * 构造"向 AI 提问"的 Prompt。
 *
 * 设计上刻意分成三种形态，因为它们的**失败模式**不同：
 *
 *   ① 问某个开源项目  —— 上下文是 GitHub 卡片上的元信息，模型要基于它
 *      回答"是什么/适合学吗/怎么上手"。风险是模型凭训练记忆瞎编，
 *      所以 Prompt 里明确要求"只依据给定信息，不确定就直说"。
 *
 *   ② 问本站代码      —— 上下文是代码索引里检索到的文件摘要。
 *      风险同样是编造，所以要求"引用你真正看到的文件路径"。
 *
 *   ③ 都没有          —— 纯概念问题，让它以教学口吻作答。
 *
 * 为什么强调"不许编"？
 *   因为这是一个**学习项目**。用户拿 AI 的答案去理解代码，
 *   一个编造的文件路径或 API 用法，代价远大于"我没查到"。
 *   宁可让它说不知道。
 */
export function buildAskQuestionPrompt(input: {
  question: string
  repoContext?: { fullName: string; description: string | null; language: string | null; htmlUrl: string } | null
  codeSnippets?: { path: string; summary: string }[]
}): string {
  const sections: string[] = [
    '你是 studyplan 这个学习项目里的技术导师，面对的是正在学习全栈开发的新手。',
    '回答要求：',
    '- 用中文，语气直接，不要客套话和"很高兴为你解答"。',
    '- 用 Markdown 组织，重点处可用加粗、列表、代码块。',
    '- 篇幅控制在 300 字以内，讲清楚即可，不要面面俱到。',
    '- **只能依据下面给出的资料作答**。资料里没有的内容，直接说明"资料中没有提到"，绝不猜测或编造。',
  ]

  if (input.repoContext) {
    const { fullName, description, language, htmlUrl } = input.repoContext
    sections.push(
      '',
      '## 用户正在看的开源项目',
      `- 仓库：${fullName}`,
      `- 主要语言：${language ?? '（未标注）'}`,
      `- 地址：${htmlUrl}`,
      `- 官方简介：${description?.trim() || '（该项目没有填写简介）'}`,
      '',
      '请围绕"它解决什么问题、适合什么阶段的人学、怎么上手"来回答。',
    )
  }

  if (input.codeSnippets && input.codeSnippets.length > 0) {
    sections.push('', '## 本站代码中相关的文件（这是唯一可靠的依据）')

    let used = 0
    for (const snippet of input.codeSnippets) {
      // 逐个累加并截断，保证总量可控 —— 否则一次塞进去几万字符，
      // 既贵又慢，还会把真正相关的片段挤到模型注意力的边缘。
      const block = `- 路径：${snippet.path}\n  说明：${snippet.summary}`
      if (used + block.length > MAX_SNIPPET_TOTAL_CHARS) break
      sections.push(block)
      used += block.length
    }

    sections.push('', '回答时请引用你确实看到的文件路径，方便用户自己去看源码核对。')
  }

  sections.push('', '## 用户的问题', input.question)

  return sections.join('\n')
}
