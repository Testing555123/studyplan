import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 本文件专测 lib/github/trending 的映射/降级/单飞语义；DB 一律走抛错桩或受控桩。
const dbState = vi.hoisted(() => ({
  selectImpl: (() => Promise.resolve([])) as () => Promise<unknown[]>,
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => dbState.selectImpl()),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => Promise.resolve()),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

const fetchMock = vi.fn()

async function importModule(env: Record<string, string>) {
  vi.resetModules()
  vi.stubEnv('GITHUB_TOKEN', env.GITHUB_TOKEN ?? '')
  const mod = await import('@/lib/github/trending')
  return mod
}

const sampleItem = {
  full_name: 'openai/math',
  html_url: 'https://github.com/openai/math',
  description: 'Lean math repo',
  language: 'Lean',
  stargazers_count: 13905,
  forks_count: 1545,
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  dbState.selectImpl = () => Promise.resolve([])
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-11T08:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('trending 白名单映射（字段显式挑选）', () => {
  it('合法 item 映射为契约字段', async () => {
    const { toTrendingRepo } = await importModule({})
    const repo = toTrendingRepo(sampleItem)
    expect(repo).toEqual({
      fullName: 'openai/math',
      htmlUrl: 'https://github.com/openai/math',
      description: 'Lean math repo',
      language: 'Lean',
      stargazersCount: 13905,
      forksCount: 1545,
    })
  })

  it('缺失 full_name/html_url 的 item 被丢弃；数值异常回 0', async () => {
    const { toTrendingRepo } = await importModule({})
    expect(toTrendingRepo({})).toBeNull()
    expect(
      toTrendingRepo({ full_name: 'a/b', html_url: 'https://x', stargazers_count: 'oops' }),
    ).toMatchObject({ stargazersCount: 0, forksCount: 0, description: null })
  })
})

describe('getTrendingCached（读路径懒刷新 / §6.4 降级）', () => {
  it('当天快照命中：不调 API，直接返回', async () => {
    dbState.selectImpl = () =>
      Promise.resolve([
        { dayKey: '2026-10-11', repos: [{ fullName: 'a/b' }], fetchedAt: new Date() },
      ])
    const mod = await importModule({ GITHUB_TOKEN: 't' })
    const snap = await mod.getTrendingCached()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(snap.repos).toEqual([{ fullName: 'a/b' }])
    expect(snap.configured).toBe(true)
  })

  it('未配置 GITHUB_TOKEN：空态且不发起任何请求', async () => {
    const mod = await importModule({})
    const snap = await mod.getTrendingCached()
    expect(snap.configured).toBe(false)
    expect(snap.repos).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('未命中：拉取 API 并映射白名单字段', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ items: [sampleItem] }), { status: 200 }),
    )
    const mod = await importModule({ GITHUB_TOKEN: 't' })
    const snap = await mod.getTrendingCached()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('created:%3E%3D2026-10-11')
    expect(String(fetchMock.mock.calls[0][0])).toContain('sort=stars')
    expect(snap.repos[0]).toMatchObject({ fullName: 'openai/math', stargazersCount: 13905 })
  })

  it('API 失败：返回空数组并 warn，不抛错（§6.4）', async () => {
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 403 }))
    const mod = await importModule({ GITHUB_TOKEN: 't' })
    const snap = await mod.getTrendingCached()
    expect(snap.repos).toEqual([])
  })

  it('并发未命中共享同一次拉取（单飞）', async () => {
    // fake timers 会冻结 mock fetch 里的 setTimeout，此用例改用真实计时器。
    vi.useRealTimers()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ items: [sampleItem] }), { status: 200 }),
    )
    const mod = await importModule({ GITHUB_TOKEN: 't' })
    const [a, b] = await Promise.all([mod.getTrendingCached(), mod.getTrendingCached()])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(a.repos).toEqual(b.repos)
  })
})
