import type { TrendingRepo } from '@/lib/db/schema/github'
import { embedQueryRemote } from '@/lib/rag/remote'
import { searchSimilar } from '@/lib/rag/store'
import { logger } from '@/lib/logger'

/**
 * 每日精选导读（最简实现）。
 *
 * - 导读正文 = 对当天快照的确定性模板计算（零 LLM、零额度、随页同请求渲染）。
 * - 「相关阶段」标注 = embed 相似度（embed 模型的正确用法：向量化比对，而非生成文字），
 *   未配置 AI Key 或任一步失败时静默跳过，绝不阻断。
 */

export interface DigestSummary {
  /** 收录项目数。 */
  count: number
  /** 语言分布（按数量降序，最多取 3）。 */
  languages: { language: string; count: number }[]
  /** Top3（star 降序——快照本身有序，直接取前三）。 */
  top: { fullName: string; stargazersCount: number }[]
  /** star 区间（快照按 star 降序，即首尾）。 */
  starRange: { min: number; max: number }
  /** 中文模板导读文案。 */
  text: string
}

/** 纯函数：由当天快照确定性生成模板导读。空快照返回 count 0 的空导读。 */
export function buildDigestFromSnapshot(repos: TrendingRepo[]): DigestSummary {
  const count = repos.length

  const languageCount = new Map<string, number>()
  for (const repo of repos) {
    if (repo.language) {
      languageCount.set(repo.language, (languageCount.get(repo.language) ?? 0) + 1)
    }
  }
  const languages = [...languageCount.entries()]
    .map(([language, n]) => ({ language, count: n }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)

  const top = repos.slice(0, 3).map((repo) => ({
    fullName: repo.fullName,
    stargazersCount: repo.stargazersCount,
  }))

  const max = count > 0 ? repos[0].stargazersCount : 0
  const min = count > 0 ? repos[count - 1].stargazersCount : 0

  const text = buildDigestText({ count, languages, top, starRange: { min, max } })
  return { count, languages, top, starRange: { min, max }, text }
}

function buildDigestText(summary: Omit<DigestSummary, 'text'>): string {
  const { count, languages, top, starRange } = summary
  if (count === 0) {
    return '今日暂无新收录项目。'
  }

  const parts: string[] = []
  parts.push(`今日新收录 ${count} 个项目`)
  if (languages.length > 0) {
    const langText = languages
      .map((l) => `${l.language} 占 ${(l.count / count * 100).toFixed(0)}%`)
      .join('、')
    parts.push(`语言分布：${langText}`)
  }
  if (top.length > 0) {
    const topText = top
      .map((r, i) => `${i + 1}. ${r.fullName}（${formatStars(r.stargazersCount)}★）`)
      .join('，')
    parts.push(`最热：${topText}`)
  }
  parts.push(`star 区间 ${formatStars(starRange.min)} ~ ${formatStars(starRange.max)}`)
  return `${parts.join('。')}。`
}

function formatStars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

/** 阶段 slug 前缀：只把电子书 stages/ 的块视为「课程阶段」。 */
const STAGE_SLUG_PREFIX = 'stages/'

/**
 * 可选后处理：为每个仓库标注与电子书最相关的阶段（embed 相似度 top-1）。
 * 单条失败跳过该仓库；整体失败返回原数组；无 description 或未配置 AI 时原样返回。
 * 刷新成功后由调用方写回（updateDayRepos）。
 */
export async function annotateStages(repos: TrendingRepo[]): Promise<TrendingRepo[]> {
  if (repos.length === 0) return repos

  const annotated: TrendingRepo[] = []
  for (const repo of repos) {
    const text = [repo.fullName, repo.description].filter(Boolean).join('：')
    if (!text) {
      annotated.push(repo)
      continue
    }
    try {
      const embedding = await embedQueryRemote(text)
      if (!embedding) {
        // 未配置或端点失败：整体降级，不再继续逐条请求。
        return repos
      }
      const [top] = await searchSimilar(embedding, 1)
      if (top && top.slug.startsWith(STAGE_SLUG_PREFIX)) {
        annotated.push({
          ...repo,
          relatedStageSlug: top.slug,
          relatedStageTitle: top.title,
        })
        continue
      }
      annotated.push(repo)
    } catch (error) {
      logger.warn({ code: 'DIGEST_ANNOTATE_FAILED', repo: repo.fullName, message: (error as Error).message })
      annotated.push(repo)
    }
  }
  return annotated
}
