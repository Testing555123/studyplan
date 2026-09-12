import { ConfigService } from '@nestjs/config'
import type { GithubRepo, TrendingRange } from '@studyplan/shared'
import { GithubClient } from './github.client'
import { GithubService } from './github.service'
import type { TrendingCache } from './schemas/trending-cache.schema'

/**
 * GithubService 的单元测试。
 *
 * 这个 Service 的价值**全在降级链上**，所以测试也围绕它展开：
 * 缓存新鲜 / 过期刷新 / 刷新失败 / 无缓存失败 / 并发节流。
 * 这五条路径光靠手点是测不出来的（要么得等 6 小时，要么得断网），
 * 而单测能在一秒内全跑一遍。
 */

/** 伪造 ConfigService：不配任何值，让 Service 走默认 TTL */
function createConfigStub(): ConfigService {
  return { get: () => undefined } as unknown as ConfigService
}

/** 造一条假的缓存文档 */
function createCacheDoc(overrides: Partial<TrendingCache> = {}): TrendingCache {
  return {
    range: '7d',
    items: [makeRepo('vuejs/core', 'Vue', 100), makeRepo('nestjs/nest', 'TypeScript', 80)],
    languages: ['Vue', 'TypeScript'],
    fetchedAt: new Date(),
    lastAttemptAt: new Date('2000-01-01'),
    ...overrides,
  } as TrendingCache
}

function makeRepo(fullName: string, language: string | null, stars: number): GithubRepo {
  return {
    id: fullName.length,
    fullName,
    name: fullName.split('/')[1] ?? fullName,
    ownerLogin: fullName.split('/')[0] ?? '',
    ownerAvatarUrl: '',
    htmlUrl: `https://github.com/${fullName}`,
    homepage: null,
    description: null,
    language,
    topics: [],
    stargazersCount: stars,
    forksCount: 0,
    openIssuesCount: 0,
    createdAt: new Date().toISOString(),
    pushedAt: new Date().toISOString(),
  }
}

/**
 * 伪造 Model。
 *
 * 只实现 Service 真正用到的三个方法，并且都要支持 `.lean()`。
 * 注意 `findOneAndUpdate` 的返回值决定"有没有抢到刷新名额"，
 * 所以它必须能被逐个用例单独覆盖。
 */
function createModelStub(doc: TrendingCache | null, claimSucceeded = true) {
  return {
    findOne: jest.fn().mockReturnValue({ lean: () => Promise.resolve(doc) }),
    findOneAndUpdate: jest
      .fn()
      .mockReturnValue({ lean: () => Promise.resolve(claimSucceeded ? doc : null) }),
    updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
  }
}

/** 伪造 GithubClient：默认返回两条数据 */
function createClientStub(impl?: () => Promise<GithubRepo[]>) {
  return {
    searchTopNewRepos: jest.fn(impl ?? (() => Promise.resolve([makeRepo('a/b', 'Go', 5)]))),
  }
}

function createService(doc: TrendingCache | null, claimSucceeded = true, clientImpl?: () => Promise<GithubRepo[]>) {
  const model = createModelStub(doc, claimSucceeded)
  const client = createClientStub(clientImpl)
  const service = new GithubService(
    model as never,
    client as unknown as GithubClient,
    createConfigStub(),
  )
  return { service, model, client }
}

describe('GithubService', () => {
  describe('缓存新鲜时', () => {
    it('直接返回缓存，且不请求 GitHub', async () => {
      const doc = createCacheDoc()
      const { service, client } = createService(doc)

      const result = await service.getTrending('7d' as TrendingRange, null)

      expect(client.searchTopNewRepos).not.toHaveBeenCalled()
      expect(result.stale).toBe(false)
      expect(result.total).toBe(2)
      expect(result.languages).toEqual(['Vue', 'TypeScript'])
    })
  })

  describe('缓存过期时', () => {
    const expired = new Date(Date.now() - 7 * 60 * 60 * 1000)

    it('成功刷新：调用 GitHub 并写回缓存', async () => {
      const doc = createCacheDoc({ fetchedAt: expired })
      const fresh = [makeRepo('new/repo', 'Rust', 999)]
      const { service, client, model } = createService(doc, true, () => Promise.resolve(fresh))

      const result = await service.getTrending('7d' as TrendingRange, null)

      expect(client.searchTopNewRepos).toHaveBeenCalledTimes(1)
      expect(model.updateOne).toHaveBeenCalledTimes(1)
      expect(result.stale).toBe(false)
      expect(result.items[0]!.fullName).toBe('new/repo')
    })

    it('刷新失败但有旧数据：返回旧数据并标记 stale', async () => {
      const doc = createCacheDoc({ fetchedAt: expired })
      const { service } = createService(doc, true, () => Promise.reject(new Error('GitHub 返回 403')))

      const result = await service.getTrending('7d' as TrendingRange, null)

      expect(result.stale).toBe(true)
      expect(result.items[0]!.fullName).toBe('vuejs/core')
      expect(result.fetchedAt).toBe(new Date(doc.fetchedAt).toISOString())
    })

    it('没抢到刷新名额（60 秒内已被别的请求占用）：不请求 GitHub，返回 stale', async () => {
      const doc = createCacheDoc({ fetchedAt: expired })
      const { service, client } = createService(doc, false)

      const result = await service.getTrending('7d' as TrendingRange, null)

      expect(client.searchTopNewRepos).not.toHaveBeenCalled()
      expect(result.stale).toBe(true)
    })
  })

  describe('完全没有缓存时', () => {
    it('首次请求会打 GitHub 并创建缓存', async () => {
      const { service, client, model } = createService(null)

      const result = await service.getTrending('1d' as TrendingRange, null)

      expect(client.searchTopNewRepos).toHaveBeenCalledTimes(1)
      expect(model.updateOne).toHaveBeenCalledTimes(1)
      expect(result.stale).toBe(false)
    })

    it('GitHub 失败且无旧数据：抛错（这是唯一会让前端显示错误态的情况）', async () => {
      const { service } = createService(null, true, () =>
        Promise.reject(new Error('GitHub 请求超时')),
      )

      await expect(service.getTrending('1d' as TrendingRange, null)).rejects.toThrow(
        'GitHub 请求超时',
      )
    })
  })

  describe('语言筛选与聚合', () => {
    it('按语言过滤 items，但语言列表仍基于全量（否则切换语言后列表会塌缩）', async () => {
      const doc = createCacheDoc()
      const { service } = createService(doc)

      const result = await service.getTrending('7d' as TrendingRange, 'TypeScript')

      expect(result.items).toHaveLength(1)
      expect(result.items[0]!.fullName).toBe('nestjs/nest')
      // 关键断言：筛选后语言列表依然是全量的两种，而不是只剩 TypeScript
      expect(result.languages).toEqual(['Vue', 'TypeScript'])
    })

    /**
     * 注意这条测的是**刷新路径**（缓存过期）而不是缓存命中路径。
     *
     * 因为语言聚合只在刷新时做一次，结果存进缓存；
     * 命中缓存时直接读 `cached.languages`，不再重新计算 ——
     * 这是有意的：100 条数据每请求聚合一次虽然不贵，但完全没必要。
     *
     * 所以"聚合逻辑对不对"只能在刷新时验证。
     */
    it('刷新时重新聚合语言：没有语言的仓库不进入列表', async () => {
      const doc = createCacheDoc({ fetchedAt: new Date(Date.now() - 7 * 60 * 60 * 1000) })
      const fresh = [makeRepo('a/b', null, 1), makeRepo('c/d', 'Go', 2)]
      const { service, model } = createService(doc, true, () => Promise.resolve(fresh))

      const result = await service.getTrending('7d' as TrendingRange, null)

      expect(result.languages).toEqual(['Go'])
      expect(result.total).toBe(2)
      // 聚合结果必须一并写进缓存，否则下次命中会读到上一次的语言列表
      expect(model.updateOne).toHaveBeenCalledWith(
        { range: '7d' },
        expect.objectContaining({ $set: expect.objectContaining({ languages: ['Go'] }) }),
        { upsert: true },
      )
    })
  })
})
