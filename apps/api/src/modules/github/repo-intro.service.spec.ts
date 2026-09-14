import { ConfigService } from '@nestjs/config'
import type { GithubRepo } from '@studyplan/shared'
import type { AiService } from '../ai/ai.service'
import type { NvNimClient } from '../ai/nv-nim.client'
import type { GithubClient } from './github.client'
import type { RepoDetailService } from './github-detail.service'
import { RepoIntroService } from './repo-intro.service'

/**
 * AI 项目简介的单元测试。
 *
 * 这个服务最需要测的不是"能不能生成"，而是**什么时候不该生成**：
 * 已经有缓存时不生成、AI 没启用时不生成、没有素材时不生成、额度耗尽时不生成。
 * 这四条决定了这个功能会不会白白烧掉额度、会不会给读者编造内容 ——
 * 而它们在真实环境里都很难复现（要等缓存过期、要把 Key 删掉、要把额度用光）。
 */

const CURRENT_MODEL = 'test-model'

function createConfig(values: Record<string, string> = {}): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService
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
    description: 'A demo project',
    language: 'TypeScript',
    topics: [],
    stargazersCount: 500,
    forksCount: 10,
    openIssuesCount: 2,
    createdAt: new Date().toISOString(),
    pushedAt: new Date().toISOString(),
    ...overrides,
  }
}

function createIntroModel(docs: Record<string, unknown>[] = []) {
  return {
    find: jest.fn().mockReturnValue({ lean: () => Promise.resolve(docs) }),
    updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
  }
}

/** 一条"仍然有效"的缓存简介：模型一致、时间够新 */
function cachedIntroDoc(repoId: number, overrides: Record<string, unknown> = {}) {
  return {
    repoId,
    fullName: 'acme/demo',
    intro: '这是一个演示项目的中文简介。',
    model: CURRENT_MODEL,
    inputHash: 'hash',
    updatedAt: new Date(),
    ...overrides,
  }
}

function createDetailService(repos: GithubRepo[]) {
  return {
    findRepoById: jest.fn((id: number) =>
      Promise.resolve(repos.find((repo) => repo.id === id) ?? null),
    ),
  }
}

function createGithubClient(readme: string | null = 'README 内容') {
  return { fetchReadme: jest.fn().mockResolvedValue(readme) }
}

function createAi(chatImpl?: () => Promise<string>) {
  return {
    enabled: true,
    currentModel: CURRENT_MODEL,
    chat: jest.fn(chatImpl ?? (() => Promise.resolve('这是一个中文简介，用来演示生成结果。'))),
  }
}

function createQuotaService(allowed = true) {
  return { tryConsumeQuota: jest.fn().mockResolvedValue({ allowed, remaining: 10 }) }
}

interface Overrides {
  config?: Record<string, string>
  cachedDocs?: Record<string, unknown>[]
  repos?: GithubRepo[]
  readme?: string | null
  chatImpl?: () => Promise<string>
  quotaAllowed?: boolean
}

function createService(overrides: Overrides = {}) {
  const introModel = createIntroModel(overrides.cachedDocs ?? [])
  const detailService = createDetailService(overrides.repos ?? [makeRepo()])
  const githubClient = createGithubClient(overrides.readme)
  const ai = createAi(overrides.chatImpl)
  const quota = createQuotaService(overrides.quotaAllowed ?? true)

  const service = new RepoIntroService(
    createConfig(overrides.config),
    introModel as never,
    detailService as unknown as RepoDetailService,
    githubClient as unknown as GithubClient,
    ai as unknown as NvNimClient,
    quota as unknown as AiService,
  )

  return { service, introModel, detailService, githubClient, ai, quota }
}

describe('RepoIntroService', () => {
  describe('缓存命中', () => {
    it('直接返回已有简介，一次模型都不调', async () => {
      const { service, ai, quota } = createService({
        cachedDocs: [cachedIntroDoc(1)],
        repos: [makeRepo()],
      })

      const result = await service.ensureIntros([1])

      expect(result.intros).toHaveLength(1)
      expect(result.pending).toEqual([])
      expect(ai.chat).not.toHaveBeenCalled()
      expect(quota.tryConsumeQuota).not.toHaveBeenCalled()
    })

    it('模型换过之后，旧简介视为失效', async () => {
      const { service, ai } = createService({
        cachedDocs: [cachedIntroDoc(1, { model: 'old-model' })],
        repos: [makeRepo()],
      })

      const result = await service.ensureIntros([1])

      // 失效 → 重新生成，所以模型会被调用
      expect(ai.chat).toHaveBeenCalledTimes(1)
      expect(result.intros).toHaveLength(1)
    })
  })

  describe('不该生成的时候', () => {
    it('AI 未启用时整体降级，pending 原样返回', async () => {
      const { service, ai } = createService({ repos: [makeRepo()] })
      // 模拟没有配 Key
      ;(ai as unknown as { enabled: boolean }).enabled = false

      const result = await service.ensureIntros([1])

      expect(result.degraded).toBe(true)
      expect(result.pending).toEqual([1])
      expect(ai.chat).not.toHaveBeenCalled()
    })

    it('额度耗尽时停止生成并标记 degraded', async () => {
      const { service, ai } = createService({ repos: [makeRepo()], quotaAllowed: false })

      const result = await service.ensureIntros([1])

      expect(result.degraded).toBe(true)
      expect(ai.chat).not.toHaveBeenCalled()
    })

    it('既没有官方简介也没有 README 时跳过，绝不编造', async () => {
      const { service, ai, githubClient } = createService({
        repos: [makeRepo({ description: null })],
        readme: null,
      })

      const result = await service.ensureIntros([1])

      expect(githubClient.fetchReadme).toHaveBeenCalledTimes(1)
      expect(ai.chat).not.toHaveBeenCalled()
      expect(result.pending).toEqual([1])
      expect(result.intros).toHaveLength(0)
    })
  })

  describe('素材来源', () => {
    it('有官方简介就不抓 README', async () => {
      const { service, githubClient } = createService({ repos: [makeRepo({ description: 'x' })] })

      await service.ensureIntros([1])

      expect(githubClient.fetchReadme).not.toHaveBeenCalled()
    })

    it('没有官方简介时才破例抓 README', async () => {
      const { service, githubClient, ai } = createService({
        repos: [makeRepo({ description: null })],
        readme: 'README 里说明了这个项目的用途。',
      })

      await service.ensureIntros([1])

      expect(githubClient.fetchReadme).toHaveBeenCalledTimes(1)
      expect(ai.chat).toHaveBeenCalledTimes(1)
    })
  })

  describe('限量生成', () => {
    it('一次最多生成 batchLimit 条，其余进 pending', async () => {
      const repos = [makeRepo({ id: 1 }), makeRepo({ id: 2 }), makeRepo({ id: 3 })]
      const { service, ai } = createService({
        config: { GITHUB_INTRO_BATCH_LIMIT: '1' },
        repos,
      })

      const result = await service.ensureIntros([1, 2, 3])

      expect(ai.chat).toHaveBeenCalledTimes(1)
      expect(result.intros).toHaveLength(1)
      expect(result.pending).toHaveLength(2)
    })

    it('按 star 降序生成：额度有限时先服务最热门的项目', async () => {
      const repos = [
        makeRepo({ id: 1, stargazersCount: 10 }),
        makeRepo({ id: 2, stargazersCount: 9999 }),
      ]
      const { service, introModel } = createService({
        config: { GITHUB_INTRO_BATCH_LIMIT: '1' },
        repos,
      })

      await service.ensureIntros([1, 2])

      // 只生成一条，应该是 star 更高的 id=2
      expect(introModel.updateOne).toHaveBeenCalledTimes(1)
      const [filter] = introModel.updateOne.mock.calls[0] as [{ repoId: number }, unknown]
      expect(filter.repoId).toBe(2)
    })
  })

  describe('输出处理', () => {
    it('输出过短视为无效，不写库也不返回', async () => {
      const { service, introModel } = createService({
        repos: [makeRepo()],
        chatImpl: () => Promise.resolve('太短'),
      })

      const result = await service.ensureIntros([1])

      expect(introModel.updateOne).not.toHaveBeenCalled()
      expect(result.pending).toEqual([1])
    })

    it('模型给整段加引号时会被清洗掉', async () => {
      const { service, introModel } = createService({
        repos: [makeRepo()],
        chatImpl: () => Promise.resolve('"这是一个被引号包起来的简介内容。"'),
      })

      await service.ensureIntros([1])

      const [, update] = introModel.updateOne.mock.calls[0] as [
        unknown,
        { $set: { intro: string } },
      ]
      expect(update.$set.intro.startsWith('"')).toBe(false)
      expect(update.$set.intro).toContain('简介内容')
    })

    it('超长输出在句末标点处收尾，不会从句子中间切断', async () => {
      // 150 字 + 句号 + 99 字。硬截会切在 200 字处（句子中间），
      // 按句末截断则应停在那个句号上。
      const longText = '一'.repeat(150) + '。' + '二'.repeat(99)
      const { service, introModel } = createService({
        repos: [makeRepo()],
        chatImpl: () => Promise.resolve(longText),
      })

      await service.ensureIntros([1])

      const [, update] = introModel.updateOne.mock.calls[0] as [
        unknown,
        { $set: { intro: string } },
      ]
      expect(update.$set.intro.endsWith('。')).toBe(true)
      expect(update.$set.intro).toHaveLength(151)
    })

    it('预算内找不到句末标点时退回硬截断，而不是砍掉大半内容', async () => {
      // 整段没有句末标点，只能硬截到上限
      const { service, introModel } = createService({
        repos: [makeRepo()],
        chatImpl: () => Promise.resolve('一'.repeat(250)),
      })

      await service.ensureIntros([1])

      const [, update] = introModel.updateOne.mock.calls[0] as [
        unknown,
        { $set: { intro: string } },
      ]
      expect(update.$set.intro).toHaveLength(200)
    })
  })

  describe('轮询接口', () => {
    it('只读取，不触发生成', async () => {
      const { service, ai, quota } = createService({
        cachedDocs: [cachedIntroDoc(1)],
        repos: [makeRepo({ id: 2 })],
      })

      const result = await service.getIntros([1, 2])

      expect(ai.chat).not.toHaveBeenCalled()
      expect(quota.tryConsumeQuota).not.toHaveBeenCalled()
      expect(result.intros).toHaveLength(1)
      expect(result.pending).toEqual([2])
    })
  })
})
