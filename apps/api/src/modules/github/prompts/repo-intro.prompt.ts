import type { ChatMessage } from '../../ai/nv-nim.client'

/**
 * 项目简介润色的 Prompt。
 *
 * ── 这份 prompt 和"每日报道"那份的区别 ──
 *
 * 报道是**创作**：给它 README，让它写一篇几百字的文章。
 * 简介是**改写**：给它作者自己写的一句话，让它翻成通顺的中文。
 * 两者的风险完全不同 —— 创作可以长，改写一旦"顺手补充"就是在编造。
 * 所以这里的约束比报道那份更硬：明确禁止补充信息里没有的内容。
 *
 * ── 为什么要求 60-90 字且不分点 ──
 *
 * 它要被塞进卡片的 `line-clamp-2` 里。字数超了会被截断成半句话，
 * 分点了在两行里更是没法看。把长度约束写进 prompt，
 * 比生成完再截断要好 —— 模型知道上限，会自己组织成完整的一段。
 */

export interface RepoIntroPromptInput {
  fullName: string
  name: string
  language: string | null
  topics: string[]
  /** 官方 description。为空时改用 README 摘录 */
  description: string | null
  /** README 摘录，仅在 description 为空时提供 */
  readme: string | null
}

const SYSTEM_PROMPT = `你是一位技术编辑，为技术社区把开源项目的官方简介改写成一段通顺的中文简介。

要求：
- 中文，一段话，60 到 90 字，不要分点，不要用 Markdown 标记。
- 读者是刚入门的开发者：遇到专有名词要顺带解释一句。
- 严格依据下面提供的信息改写。**信息里没有的功能、用法、数据，一律不要补充。**
- 如果信息太少不足以写出一段话，就如实说"这个项目的信息较少，建议打开仓库查看"，不要猜测。
- 不要使用"革命性""史上最强""必学"这类营销词，也不要写空洞的赞美。
- 直接输出简介正文，不要写"好的""以下是"之类的前缀。`

/** README 摘录的字数上限。简介只需要知道"这项目大概干什么"，不需要细节 */
const README_EXCERPT_LENGTH = 1200

export function buildRepoIntroPrompt(input: RepoIntroPromptInput): ChatMessage[] {
  const lines: string[] = []

  lines.push(`- 仓库：${input.fullName}`)
  lines.push(`- 主要语言：${input.language ?? '未知'}`)
  if (input.topics.length > 0) lines.push(`- 话题标签：${input.topics.join('、')}`)

  if (input.description) {
    lines.push('')
    lines.push('官方简介（英文）：')
    lines.push(input.description)
  } else if (input.readme) {
    lines.push('')
    lines.push('这个仓库没有官方简介，以下是它 README 的摘录：')
    lines.push('---')
    lines.push(input.readme.slice(0, README_EXCERPT_LENGTH))
    lines.push('---')
  } else {
    lines.push('')
    lines.push('（这个仓库既没有官方简介，也没有 README。）')
  }

  lines.push('')
  lines.push(
    '请把上面这段信息改写成一段 60-90 字的中文简介，让刚入门的开发者一眼看懂这个项目是做什么的。',
  )

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: lines.join('\n') },
  ]
}
