import { NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { GithubRepo } from '@studyplan/shared'
import type { GithubClient } from './github.client'
import { RepoDetailService } from './github-detail.service'

/**
 * 仓库详情（三级回退）的单元测试。
 *
 * 这个服务存在的全部理由是"**分享出去的链接不会 404，又不烧 GitHub 配额**"，
 * 所以测试就围着这两点：各级命中时到底有没有打 GitHub，
 * 以及最坏情况下会不会给出正确的 404 而不是把上游错误甩给用户。
 */

function createConfig(): ConfigService {
  return { get: () => undefined } as unknown as ConfigService
}

function makeRepo(overrides: Partial<GithubRepo> = {}): GithubRepo {
  return {
    id: 1,
    fullName: 'acme/demo',
    name: 'demo',
    ownerLogin: 'acme',
    ownerAvatarUrl: '',
    htmlUrl: 'https://github.com/acme/demo',
    homepage: null,
    description: null,
    language: 'TypeScript',
    topics: [],
    stargazersCount: 100,
    forksCount: 5,
    openIssuesCount: 1,
    createdAt: new Date().toISOString(),
    pushedAt: new Date().toISOString(),
    ...overrides,
  }
}

function createCacheModel(items: GithubRepo[] = [], fetchedAt = new Date()) {
  return {
    find: jest.fn().mockReturnValue({ lean: () => Promise.resolve([{ items, fetchedAt }]) }),
  }
}

interface SnapshotDoc {
  repoId: number
  fullName: string
  repo: GithubRepo
  updatedAt: Date
}

function createSnapshotModel(docs: SnapshotDoc[] = []) {
  return {
    findOne: jest.fn((filter: Record<string, unknown>) => {
      const match = docs.find((doc) =>
        filter.fullName ? doc.fullName === filter.fullName : doc.repoId === filter.repoId,
      )
      return { lean: () => Promise.resolve(match ?? null) }
    }),
    updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
  }
}

function createClient(impl?: () => Promise<GithubRepo | null>) {
  return { fetchRepo: jest.fn(impl ?? (() => Promise.resolve(makeRepo()))) }
}

function createService(options: {
  cacheItems?: GithubRepo[]
  snapshots?: SnapshotDoc[]
  clientImpl?: () => Promise<GithubRepo | null>
} = {}) {
  const cacheModel = createCacheModel(options.cacheItems ?? [])
  const snapshotModel = createSnapshotModel(options.snapshots ?? [])
  const client = createClient(options.clientImpl)

  const service = new RepoDetailService(
    cacheModel as never,
    snapshotModel as never,
    client as unknown as GithubClient,
    createConfig(),
  )

  return { service, cacheModel, snapshotModel, client }
}

describe('RepoDetailService', () => {
  it('榜单缓存里就有：直接用，一次 GitHub 都不打', async () => {
    const repo = makeRepo()
    const { service, client } = createService({ cacheItems: [repo] })

    const result = await service.getDetail('acme/demo')

    expect(result.source).toBe('trending-cache')
    expect(result.repo.fullName).toBe('acme/demo')
    expect(client.fetchRepo).not.toHaveBeenCalled()
  })

  it('缓存没有、快照有：走快照，同样不打 GitHub', async () => {
    const repo = makeRepo()
    const { service, client } = createService({
      cacheItems: [],
      snapshots: [
        { repoId: repo.id, fullName: repo.fullName, repo, updatedAt: new Date() },
      ],
    })

    const result = await service.getDetail('acme/demo')

    expect(result.source).toBe('snapshot')
    expect(client.fetchRepo).not.toHaveBeenCalled()
  })

  it('都没有：回源 GitHub，并把结果落库（同一个仓库只回源一次）', async () => {
    const repo = makeRepo()
    const { service, client, snapshotModel } = createService({
      cacheItems: [],
      snapshots: [],
      clientImpl: () => Promise.resolve(repo),
    })

    const result = await service.getDetail('acme/demo')

    expect(result.source).toBe('github')
    expect(client.fetchRepo).toHaveBeenCalledTimes(1)
    // 关键断言：取到就写库，之后别人打开同一个分享链接不再回源
    expect(snapshotModel.updateOne).toHaveBeenCalledTimes(1)
  })

  it('三级都没有：抛 404，而不是把上游错误甩给用户', async () => {
    const { service } = createService({
      cacheItems: [],
      snapshots: [],
      clientImpl: () => Promise.resolve(null),
    })

    await expect(service.getDetail('acme/demo')).rejects.toThrow(NotFoundException)
  })

  it('按 id 查找时不回源：为一个没见过的 id 专门打 GitHub 不值得', async () => {
    const { service, client } = createService({ cacheItems: [], snapshots: [] })

    const found = await service.findRepoById(1)

    expect(found).toBeNull()
    expect(client.fetchRepo).not.toHaveBeenCalled()
  })
})
