import { eq, lt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { githubTrendingDays, type GithubTrendingDayRow, type TrendingRepo } from '@/lib/db/schema/github'
import { logger } from '@/lib/logger'
import { currentDayKey } from '@/lib/ai/quota'

/**
 * GitHub 热门仓库（官方 Search API + 按自然日 PG 快照）。
 *
 * - 无官方 trending API，业界标准做法即 Search API `created:>=当日 sort:stars`（每日仅 1 次调用）。
 * - 读路径懒刷新：当天键缺失时拉取并 upsert（单飞去重 + 幂等兜底），失败只 warn 降级为空态。
 * - env 直接读取而非走 @app/shared —— T0 契约已冻结（沿 lib/rag/remote.ts 模式）。
 */
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? ''
export const GITHUB_TRENDING_PER_PAGE = Number(process.env.GITHUB_TRENDING_PER_PAGE ?? 30)
/** 快照保留天数：刷新成功后顺手清理更旧的行（best-effort）。 */
export const GITHUB_TRENDING_KEEP_DAYS = 7

export function isGithubConfigured(): boolean {
  return GITHUB_TOKEN.length > 0
}

interface GithubSearchItem {
  full_name?: unknown
  html_url?: unknown
  description?: unknown
  language?: unknown
  stargazers_count?: unknown
  forks_count?: unknown
}

/** Search API item → 白名单契约（逐字段显式挑选，绝不透传原始行）。 */
export function toTrendingRepo(item: GithubSearchItem): TrendingRepo | null {
  if (typeof item.full_name !== 'string' || typeof item.html_url !== 'string') return null
  const stars = item.stargazers_count
  const forks = item.forks_count
  return {
    fullName: item.full_name,
    htmlUrl: item.html_url,
    description: typeof item.description === 'string' ? item.description : null,
    language: typeof item.language === 'string' ? item.language : null,
    stargazersCount: typeof stars === 'number' && Number.isFinite(stars) ? stars : 0,
    forksCount: typeof forks === 'number' && Number.isFinite(forks) ? forks : 0,
  }
}

/** 拉取指定自然日的热门仓库（创建于当日、按 star 降序）。失败抛错由调用方降级。 */
export async function fetchTrendingForDay(dayKey: string, perPage = GITHUB_TRENDING_PER_PAGE): Promise<TrendingRepo[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    // GitHub API 要求显式 User-Agent。
    'User-Agent': 'studyplan',
  }
  if (isGithubConfigured()) headers.Authorization = `Bearer ${GITHUB_TOKEN}`

  const url = `https://api.github.com/search/repositories?q=created:%3E%3D${dayKey}&sort=stars&order=desc&per_page=${perPage}`
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) {
    throw new Error(`github search api ${res.status}`)
  }
  const body = (await res.json()) as { items?: GithubSearchItem[] }
  const items = Array.isArray(body.items) ? body.items : []
  return items.map(toTrendingRepo).filter((r): r is TrendingRepo => r !== null)
}

async function readDayRow(dayKey: string): Promise<GithubTrendingDayRow | null> {
  const rows = await db
    .select()
    .from(githubTrendingDays)
    .where(eqDayKey(dayKey))
    .limit(1)
  return rows[0] ?? null
}

function eqDayKey(dayKey: string) {
  return eq(githubTrendingDays.dayKey, dayKey)
}

/** 旧行清理（best-effort，只在后台刷新成功后调用）。 */
async function pruneOldDays(now = new Date()): Promise<void> {
  const cutoff = new Date(now)
  cutoff.setUTCDate(cutoff.getUTCDate() - GITHUB_TRENDING_KEEP_DAYS)
  await db.delete(githubTrendingDays).where(lt(githubTrendingDays.fetchedAt, cutoff))
}

async function upsertDay(dayKey: string, repos: TrendingRepo[]): Promise<void> {
  await db
    .insert(githubTrendingDays)
    .values({ dayKey, repos, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: githubTrendingDays.dayKey,
      set: { repos, fetchedAt: new Date() },
    })
}

// 进行中的刷新（单飞）：并发未命中共享同一次拉取。
let inflight: Promise<TrendingRepo[]> | null = null

/** 测试辅助：清空单飞状态。 */
export function __resetTrendingSingleFlight(): void {
  inflight = null
}

/**
 * 当天快照缺失则拉取（单飞 + upsert 幂等）。失败返回空数组并 warn，绝不抛错阻断页面。
 */
async function refreshDay(dayKey: string): Promise<TrendingRepo[]> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const repos = await fetchTrendingForDay(dayKey)
      await upsertDay(dayKey, repos)
      await pruneOldDays().catch((error) => {
        logger.warn({ code: 'TRENDING_PRUNE_FAILED', message: (error as Error).message })
      })
      return repos
    } catch (error) {
      logger.warn({ code: 'TRENDING_REFRESH_FAILED', message: (error as Error).message })
      return []
    } finally {
      inflight = null
    }
  })()
  return inflight
}

export interface TrendingSnapshot {
  repos: TrendingRepo[]
  /** GITHUB_TOKEN 是否已配置（未配置时页面展示配置提示空态）。 */
  configured: boolean
  fetchedAt: Date | null
}

/**
 * 读路径入口：先读当天快照，缺失时懒刷新（单飞）。
 * DB 读写失败同样只 warn 降级（§6.4 模式）。
 */
export async function getTrendingCached(dayKey = currentDayKey()): Promise<TrendingSnapshot> {
  const configured = isGithubConfigured()
  try {
    const row = await readDayRow(dayKey)
    if (row) return { repos: row.repos ?? [], configured, fetchedAt: row.fetchedAt }
  } catch (error) {
    logger.warn({ code: 'TRENDING_READ_FAILED', message: (error as Error).message })
  }

  const repos = configured ? await refreshDay(dayKey) : []
  let fetchedAt: Date | null = null
  if (repos.length > 0) {
    try {
      const row = await readDayRow(dayKey)
      fetchedAt = row?.fetchedAt ?? null
    } catch {
      fetchedAt = null
    }
  }
  return { repos, configured, fetchedAt }
}

/** 供懒刷新后处理（digest embed 标注）复用的写回入口。 */
export async function updateDayRepos(dayKey: string, repos: TrendingRepo[]): Promise<void> {
  await upsertDay(dayKey, repos)
}
