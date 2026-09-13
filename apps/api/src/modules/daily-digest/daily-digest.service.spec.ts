import { ConfigService } from '@nestjs/config'
import { CONTENT_MAX_LENGTH, GITHUB_SOURCE_TAG, type GithubRepo } from '@studyplan/shared'
import type { NvNimClient } from '../ai/nv-nim.client'
import type { GithubClient } from '../github/github.client'
import type { GithubService } from '../github/github.service'
import type { PostsService } from '../posts/posts.service'
import type { UsersService } from '../users/users.service'
import { DailyDigestService } from './daily-digest.service'

/**
 * 每日报道装置的单元测试。
 *
 * 这个装置几乎**没法手测**：它依赖"今天还没发过"这个状态，
 * 触发一次就要真发一篇帖子、真调一次 AI。
 * 所以下面这些分支只能靠单测覆盖 ——
 * 尤其是"并发占位冲突"和"AI 挂了要兜底"这两条，
 * 它们在真实环境里可能几个月才出现一次，但出现时必须是正确的。
 */

/** 默认开启装置，并把发布时间设为 0 点（避免受当前小时影响） */
const ENABLED_CONFIG: Record<string, string> = {
  DAILY_DIGEST_ENABLED: 'true',
  DAILY_DIGEST_TIMEZONE: 'Asia/Shanghai',
  DAILY_DIGEST_PUBLISH_HOUR: '0',
}

function createConfig(values: Record<string, string> = {}): ConfigService {
  const merged = { ...ENABLED_CONFIG, ...values }
  return { get: (key: string) => merged[key] } as unknown as ConfigService
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
    description: '一个演示项目',
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

/** 伪造 daily_picks Model。每个方法都支持被测代码用到的调用形式 */
function createPickModel(options: {
  /** 今天已存在的记录（模拟"今天发过了"） */
  existing?: Record<string, unknown> | null
  /** 历史上已经推荐过的仓库 id */
  usedRepoIds?: number[]
  /** 覆盖 create 的行为，用于模拟并发冲突 */
  createImpl?: () => Promise<unknown>
} = {}) {
  return {
    findOne: jest.fn().mockReturnValue({
      lean: () => Promise.resolve(options.existing ?? null),
    }),
    find: jest.fn().mockReturnValue({
      lean: () =>
        Promise.resolve((options.usedRepoIds ?? []).map((repoId) => ({ repoId }))),
    }),
    create: jest.fn(options.createImpl ?? (() => Promise.resolve({}))),
    updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
  }
}

function createUsersService() {
  const bot = {
    _id: 'bot-id',
    email: 'github-daily@studyplan.local',
    username: 'github-daily',
  }
  return {
    findByEmail: jest.fn().mockResolvedValue(bot),
    create: jest.fn().mockResolvedValue(bot),
  }
}

function createGithubService(items: GithubRepo[], impl?: () => Promise<unknown>) {
  return {
    getTrending: jest.fn(
      impl ??
        (() =>
          Promise.resolve({
            range: '1m',
            language: null,
            items,
            languages: [],
            total: items.length,
            fetchedAt: new Date().toISOString(),
            stale: false,
          })),
    ),
  }
}

function createGithubClient(readme: string | null = '这是一个用于测试的 README 内容。') {
  return { fetchReadme: jest.fn().mockResolvedValue(readme) }
}

function createPostsService() {
  return {
    create: jest.fn().mockResolvedValue({
      id: 'post-1',
      title: '',
      content: '',
      tags: [],
      author: { id: 'bot-id', username: 'github-daily' },
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
    }),
  }
}

function createAi(options: { enabled: boolean; chatImpl?: () => Promise<string> }) {
  return {
    enabled: options.enabled,
    chat: jest.fn(options.chatImpl ?? (() => Promise.resolve('报道正文。'.repeat(100)))),
  }
}

interface ServiceOverrides {
  config?: Record<string, string>
  items?: GithubRepo[]
  existing?: Record<string, unknown> | null
  usedRepoIds?: number[]
  createImpl?: () => Promise<unknown>
  readme?: string | null
  aiEnabled?: boolean
  chatImpl?: () => Promise<string>
  trendingImpl?: () => Promise<unknown>
}

function createService(overrides: ServiceOverrides = {}) {
  const model = createPickModel({
    existing: overrides.existing,
    usedRepoIds: overrides.usedRepoIds,
    createImpl: overrides.createImpl,
  })
  const users = createUsersService()
  const github = createGithubService(overrides.items ?? [makeRepo()], overrides.trendingImpl)
  const client = createGithubClient(overrides.readme)
  const posts = createPostsService()
  const ai = createAi({
    enabled: overrides.aiEnabled ?? true,
    chatImpl: overrides.chatImpl,
  })

  const service = new DailyDigestService(
    createConfig(overrides.config),
    model as never,
    users as unknown as UsersService,
    github as unknown as GithubService,
    client as unknown as GithubClient,
    posts as unknown as PostsService,
    ai as unknown as NvNimClient,
  )

  return { service, model, users, github, client, posts, ai }
}

describe('DailyDigestService', () => {
  describe('总开关', () => {
    it('未开启时直接返回 disabled，且不碰 GitHub', async () => {
      const { service, github } = createService({
        config: { DAILY_DIGEST_ENABLED: 'false' },
      })

      const result = await service.runDailyDigest()

      expect(result.status).toBe('disabled')
      expect(github.getTrending).not.toHaveBeenCalled()
    })
  })

  describe('幂等', () => {
    it('今天已经发过时返回 already-published，不再发帖', async () => {
      const { service, posts } = createService({
        existing: { date: 'x', fullName: 'acme/demo', htmlUrl: 'https://github.com/acme/demo' },
      })

      const result = await service.runDailyDigest()

      expect(result.status).toBe('already-published')
      expect(posts.create).not.toHaveBeenCalled()
    })

    it('并发下另一个实例抢到占位（唯一键冲突）时安全退出', async () => {
      const { service, posts } = createService({
        createImpl: () => Promise.reject(Object.assign(new Error('duplicate'), { code: 11000 })),
      })

      const result = await service.runDailyDigest()

      expect(result.status).toBe('already-published')
      expect(posts.create).not.toHaveBeenCalled()
    })
  })

  describe('候选筛选', () => {
    it('star 达不到下限的项目不会被推荐', async () => {
      const { service, posts } = createService({
        items: [makeRepo({ stargazersCount: 3 })],
      })

      const result = await service.runDailyDigest()

      expect(result.status).toBe('no-candidate')
      expect(posts.create).not.toHaveBeenCalled()
    })

    it('已经推荐过的项目会被跳过（去重）', async () => {
      const { service, posts } = createService({
        items: [makeRepo({ id: 42, stargazersCount: 999 })],
        usedRepoIds: [42],
      })

      const result = await service.runDailyDigest()

      expect(result.status).toBe('no-candidate')
      expect(posts.create).not.toHaveBeenCalled()
    })

    it('不在语言白名单里的项目会被跳过', async () => {
      const { service } = createService({
        config: { DAILY_DIGEST_LANGUAGES: 'TypeScript' },
        items: [makeRepo({ language: 'Go' })],
      })

      const result = await service.runDailyDigest()

      expect(result.status).toBe('no-candidate')
    })
  })

  describe('生成与发布', () => {
    it('AI 可用时按 AI 内容发布，并打上来源标签', async () => {
      const { service, posts, ai, model } = createService({ aiEnabled: true })

      const result = await service.runDailyDigest()

      expect(result.status).toBe('published')
      expect(result.source).toBe('ai')
      expect(ai.chat).toHaveBeenCalledTimes(1)

      const [dto, actor] = posts.create.mock.calls[0] as [
        { title: string; content: string; tags: string[] },
        { username: string },
      ]
      expect(dto.tags).toContain(GITHUB_SOURCE_TAG)
      expect(dto.title).toContain('demo')
      expect(actor.username).toBe('github-daily')

      // 发帖成功后要回填 postId，否则这条推荐无法追溯
      expect(model.updateOne).toHaveBeenCalled()
    })

    it('AI 不可用时退回模板，但当天照样发布', async () => {
      const { service, posts, ai } = createService({ aiEnabled: false })

      const result = await service.runDailyDigest()

      expect(result.status).toBe('published')
      expect(result.source).toBe('template')
      expect(ai.chat).not.toHaveBeenCalled()

      const [dto] = posts.create.mock.calls[0] as [
        { title: string; content: string; tags: string[] },
        unknown,
      ]
      // 兜底版必须给出仓库地址，否则读者无从下手
      expect(dto.content).toContain('https://github.com/acme/demo')
      expect(dto.content.length).toBeLessThanOrEqual(CONTENT_MAX_LENGTH)
    })

    it('AI 输出过短视为失败，仍然退回模板而不是发一篇空文', async () => {
      const { service, posts } = createService({
        aiEnabled: true,
        chatImpl: () => Promise.resolve('太短了'),
      })

      const result = await service.runDailyDigest()

      expect(result.status).toBe('published')
      expect(result.source).toBe('template')
      const [dto] = posts.create.mock.calls[0] as [{ content: string }, unknown]
      expect(dto.content).toContain('https://github.com/acme/demo')
    })
  })

  describe('标签归类', () => {
    it('语言能映射到白名单标签时带上该标签', async () => {
      const { service, posts } = createService({
        items: [makeRepo({ language: 'TypeScript' })],
      })

      await service.runDailyDigest()

      const [dto] = posts.create.mock.calls[0] as [{ tags: string[] }, unknown]
      expect(dto.tags).toContain('TypeScript')
      expect(dto.tags[0]).toBe(GITHUB_SOURCE_TAG)
    })

    it('语言映射不到时落到兜底标签 工程化', async () => {
      const { service, posts } = createService({
        items: [makeRepo({ language: 'Rust' })],
      })

      await service.runDailyDigest()

      const [dto] = posts.create.mock.calls[0] as [{ tags: string[] }, unknown]
      expect(dto.tags).toContain('工程化')
      expect(dto.tags).toContain(GITHUB_SOURCE_TAG)
    })
  })

  describe('稳定性', () => {
    it('上游（GitHub 榜单）抛错时返回 failed，不把异常抛给调度器', async () => {
      const { service, posts } = createService({
        trendingImpl: () => Promise.reject(new Error('GitHub 请求超时')),
      })

      const result = await service.runDailyDigest()

      expect(result.status).toBe('failed')
      expect(result.reason).toContain('GitHub 请求超时')
      expect(posts.create).not.toHaveBeenCalled()
    })

    it('惰性触发在关闭时不产生任何副作用', async () => {
      const { service, github } = createService({
        config: { DAILY_DIGEST_LAZY_TRIGGER: 'false' },
      })

      await service.maybeTriggerOnRead()

      expect(github.getTrending).not.toHaveBeenCalled()
    })
  })
})
