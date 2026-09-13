import { CONTENT_MAX_LENGTH, TITLE_MAX_LENGTH, type GithubRepo } from '@studyplan/shared'

/**
 * 报道降级用的「数据卡片」模板与标题生成。
 *
 * ── 为什么必须有模板兜底 ──
 *
 * AI 是这个装置里**唯一不可控**的环节：Key 可能没配、模型可能下线、
 * 可能限流、可能超时。如果 AI 一挂当天就没有报道，
 * 那用户看到的是"这个功能时有时无"，比没有更糟。
 *
 * 模板版虽然不如 AI 版生动，但它**永远能产出**，
 * 而且它提供的是事实（星数、语言、更新时间），
 * 对"今天有没有更新"这个问题来说已经足够。
 *
 * 这正是本项目一贯的取舍：**宁可内容朴素，不可功能缺席。**
 */

/** README 摘录的最大长度。模板里只放一小段，太长会挤掉数据区 */
const README_EXCERPT_LENGTH = 400

export interface FallbackReport {
  title: string
  content: string
}

/**
 * 生成标题。
 *
 * 标题**故意不由 AI 生成**：它要落在 `TITLE_MAX_LENGTH`（80）以内，
 * 而让模型"写一个不超过 80 字的标题"是典型的不可靠约束 ——
 * 超长就得截断，截断又会留下半句话。
 * 仓库名 + 语言是确定的信息，拼出来既安全又稳定。
 */
export function buildReportTitle(repo: GithubRepo): string {
  const suffix = repo.language ? `（${repo.language}）` : ''
  const raw = `每日 GitHub 推荐 · ${repo.name}${suffix}`
  return raw.length <= TITLE_MAX_LENGTH ? raw : raw.slice(0, TITLE_MAX_LENGTH)
}

/**
 * 生成降级报道。
 *
 * 结构上和 AI 版保持一致的五个小节 ——
 * 这样无论当天走的是哪条路径，读者看到的信息骨架是一样的。
 */
export function buildFallbackReport(repo: GithubRepo, readme: string | null): FallbackReport {
  const updatedAt = repo.pushedAt.slice(0, 10)

  const sections: string[] = []

  sections.push(
    '> 本文由系统自动发布，内容取自仓库元数据与 README。' +
      '当前 AI 摘要不可用，以下为自动整理的数据卡片，信息未经人工核实。',
  )
  sections.push('')

  sections.push('## 它解决什么问题')
  sections.push(
    repo.description
      ? repo.description
      : '作者还没有填写项目描述，建议打开仓库主页看 README。',
  )
  sections.push('')

  sections.push('## 5 分钟上手')
  sections.push(`打开仓库地址查看安装与用法：${repo.htmlUrl}`)
  sections.push('')

  if (readme) {
    sections.push('## README 摘录')
    sections.push(readme.slice(0, README_EXCERPT_LENGTH))
    sections.push('')
  }

  sections.push('## 适合谁')
  sections.push('暂无法判断，等 AI 摘要恢复后这里会给出针对新手的建议。')
  sections.push('')

  sections.push('## 项目数据')
  sections.push(
    [
      `- 仓库：[${repo.fullName}](${repo.htmlUrl})`,
      `- 主要语言：${repo.language ?? '未知'}`,
      `- Star：${repo.stargazersCount} Fork：${repo.forksCount} 未关闭 issue：${repo.openIssuesCount}`,
      `- 最近更新：${updatedAt}`,
    ].join('\n'),
  )

  const content = sections.join('\n').slice(0, CONTENT_MAX_LENGTH)

  return { title: buildReportTitle(repo), content }
}
