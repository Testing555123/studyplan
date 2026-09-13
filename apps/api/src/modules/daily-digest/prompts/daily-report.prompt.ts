import type { ChatMessage } from '../../ai/nv-nim.client'

/**
 * 「每日 GitHub 项目报道」的 Prompt。
 *
 * ── 为什么要求直接输出 Markdown，而不是 JSON ──
 *
 * 现有 AI 摘要走的是「要求返回 JSON → 解析 → 校验」这条路，
 * 那对"两三个字段的短输出"是合适的。但一篇报道几百字，
 * JSON 需要把整篇文章塞进一个字符串字段里转义，
 * 模型一不小心漏个引号就整篇解析失败 —— 而失败意味着今天没有报道。
 *
 * 直接输出 Markdown 把这个**整类故障**消掉了：
 * 最坏情况只是格式有点歪，文章仍然可读、可发布。
 *
 * ── 为什么把"不要编造"写成硬要求 ──
 *
 * 模型的强项是组织语言，弱项是事实。而报道里的事实（能干什么、怎么装）
 * 恰恰是读者唯一真正关心的东西。所以这里明确允许它说"文档里没提到" ——
 * 一句"没提到"远比一段看起来很专业、实际是编出来的介绍有价值。
 */

export interface DailyReportPromptInput {
  fullName: string
  htmlUrl: string
  homepage: string | null
  description: string | null
  language: string | null
  topics: string[]
  stargazersCount: number
  forksCount: number
  openIssuesCount: number
  pushedAt: string
  /** 清洗后的 README 片段，可能是 null */
  readme: string | null
}

const SYSTEM_PROMPT = `你是一位面向编程新手的技术编辑，为技术社区写"每日开源项目推荐"。

写作要求：
- 用中文，语气平实，像在给同事介绍一个你刚发现的好东西。
- 读者是刚入门的开发者：遇到专有名词要顺带解释一句，不要假设他懂。
- 只根据下面提供的项目信息来写。信息里没有的内容，就写"文档里没有说明"，绝对不要自己编造功能、用法或数据。
- 不要使用"革命性""史上最强""必学"这类夸大措辞，也不要写空洞的赞美句。
- 直接输出 Markdown 正文，不要套一层 JSON，也不要在开头写"好的，以下是"。`

/** 把项目信息拼成给模型的素材块 */
function buildMaterial(input: DailyReportPromptInput): string {
  const lines: string[] = []

  lines.push(`- 仓库：${input.fullName}`)
  lines.push(`- 地址：${input.htmlUrl}`)
  lines.push(`- 主要语言：${input.language ?? '未知'}`)
  lines.push(`- Star：${input.stargazersCount} Fork：${input.forksCount} 未关闭 issue：${input.openIssuesCount}`)
  lines.push(`- 最近一次推送：${input.pushedAt.slice(0, 10)}`)

  if (input.topics.length > 0) lines.push(`- 话题标签：${input.topics.join('、')}`)
  if (input.homepage) lines.push(`- 官网：${input.homepage}`)
  if (input.description) lines.push(`- 项目自我介绍：${input.description}`)

  if (input.readme) {
    lines.push('')
    lines.push('以下是该项目 README 的摘录（可能不完整）：')
    lines.push('---')
    lines.push(input.readme)
    lines.push('---')
  } else {
    lines.push('')
    lines.push('（未能获取到 README，请仅根据以上元数据和你的常识来写，不确定的地方明说。）')
  }

  return lines.join('\n')
}

const STRUCTURE = `请按下面五个小标题组织，每个小节 2-4 句话，全文控制在 400-800 字：

## 它解决什么问题
用一句大白话说明这个项目的用途，以及没有它的时候大家通常怎么凑合。

## 5 分钟上手
给出最短的试用路径（安装或打开地址）。如果 README 里没有明确写，就说"文档里没有说明"。

## 适合谁
说清楚什么阶段的开发者会从中受益，也说清楚谁暂时不需要它。

## 注意事项
提醒真实存在的坑：成熟度、维护频率、学习成本、依赖体积等。如果确实没发现明显问题，就写"暂未发现明显坑点"，不要硬凑。

## 项目数据
用一行列出 Star / Fork / 最近更新时间，并附上仓库地址链接。`

export function buildDailyReportPrompt(input: DailyReportPromptInput): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${buildMaterial(input)}\n\n${STRUCTURE}`,
    },
  ]
}
