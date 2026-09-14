import { ConfigService } from '@nestjs/config'
import { CONTENT_MAX_LENGTH, GITHUB_SOURCE_TAG, type GithubRepo } from '@studyplan/shared'
import type { NvNimClient } from '../ai/nv-nim.client'
import type { CommentsService } from '../comments/comments.service'
import type { GithubClient } from '../github/github.client'
import type { GithubService } from '../github/github.service'
import type { LikesService } from '../likes/likes.service'
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

/**
 * 在指定时区里算出"现在几点"。
 *
 * 测试发布时间闸门时必须自己算一遍：被测代码用的是同一套 `Intl` 逻辑，
 * 而当前小时取决于跑测试的时刻 —— 写死一个 `publishHour` 会变成
 * "白天跑是绿的、半夜跑是红的"这种最难查的假失败。
 */
function currentHourIn(zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date())

  return Number(parts.find((part) => part.type === 'hour')?.value ?? '0')
}

/**
 * 在指定时区里算出"今天"的日期键（`YYYY-MM-DD`）。
 *
 * 与上面 `currentHourIn` 同源同理：被测代码用 `Intl` 按 Asia/Shanghai
 * 算今天，而"今天"取决于**跑测试的日子**。写死一个日期字面量，
 * 就会得到"当天全绿、第二天全红"的假失败 —— 本项目就踩过一次，
 * 表面现象是"我没改代码，测试却突然挂了"，非常消耗信任。
 *
 * ⚠️ 这段逻辑**故意**与 `DailyDigestService.todayKey` 保持一致
 *    （en-US + year:numeric + month/day:2-digit）。
 *    两者若漂移，相关用例会给出**假绿**，所以改动任一处时都要同时看另一处。
 */
function todayKeyIn(zone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const values: Record<string, string> = {}
  for (const part of parts) values[part.type] = part.value

  return `${values.year}-${values.month}-${values.day}`
}

/** 撤回相关用例里"今天"的值 —— 装置固定按 Asia/Shanghai 取日期 */
const TODAY = todayKeyIn('Asia/Shanghai')

/**
 * 挑一个"当前小时不是 23 点"的时区。
 *
 * 需要这个是为了能安全地取 `hour + 1` 当"还没到发布时间"。
 * 这几个候选时区的偏移量彼此相差 1 小时以上，所以在任何时刻
 * 至多只有一个会是 23 点 —— 一定挑得出来。
 */
function pickZoneBeforeMidnight(): { zone: string; hour: number } {
  const zones = ['Asia/Shanghai', 'UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo']

  for (const zone of zones) {
    const hour = currentHourIn(zone)
    if (hour < 23) return { zone, hour }
  }

  throw new Error('候选时区全都落在 23 点，这在同一次调用里不可能发生')
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
    deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
  }
}

/**
 * 伪造 `daily_pick_excludes` Model。
 *
 * `findOne` 对应"这天是不是已经撤回过"，`find` 对应候选筛选时取排除名单。
 */
function createExcludeModel(
  options: { existing?: Record<string, unknown> | null; repoIds?: number[] } = {},
) {
  return {
    findOne: jest.fn().mockReturnValue({
      lean: () => Promise.resolve(options.existing ?? null),
    }),
    find: jest.fn().mockReturnValue({
      lean: () => Promise.resolve((options.repoIds ?? []).map((repoId) => ({ repoId }))),
    }),
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
    // 撤回报道时用它删帖
    remove: jest.fn().mockResolvedValue(undefined),
  }
}

function createAi(options: { enabled: boolean; chatImpl?: () => Promise<string> }) {
  return {
    enabled: options.enabled,
    chat: jest.fn(options.chatImpl ?? (() => Promise.resolve('报道正文。'.repeat(100)))),
  }
}

function createCommentsService(deletedCount = 2) {
  return { deleteByPost: jest.fn().mockResolvedValue(deletedCount) }
}

function createLikesService(deletedCount = 3) {
  return { deleteByPost: jest.fn().mockResolvedValue(deletedCount) }
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
  /** 排除表里已有的记录（模拟"这天已经撤回过"） */
  existingExclude?: Record<string, unknown> | null
  /** 排除表里已有的仓库 id（模拟"这些项目已经被撤过"） */
  excludedRepoIds?: number[]
  commentsDeleted?: number
  likesDeleted?: number
}

function createService(overrides: ServiceOverrides = {}) {
  const model = createPickModel({
    existing: overrides.existing,
    usedRepoIds: overrides.usedRepoIds,
    createImpl: overrides.createImpl,
  })
  const exclude = createExcludeModel({
    existing: overrides.existingExclude,
    repoIds: overrides.excludedRepoIds,
  })
  const comments = createCommentsService(overrides.commentsDeleted)
  const likes = createLikesService(overrides.likesDeleted)
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
    exclude as never,
    comments as unknown as CommentsService,
    likes as unknown as LikesService,
    users as unknown as UsersService,
    github as unknown as GithubService,
    client as unknown as GithubClient,
    posts as unknown as PostsService,
    ai as unknown as NvNimClient,
  )

  return { service, model, exclude, comments, likes, users, github, client, posts, ai }
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

    it('minStars 配 0 时不再过滤 star（0 是有效值，不能被换成默认的 50）', async () => {
      const { service, posts } = createService({
        config: { DAILY_DIGEST_MIN_STARS: '0' },
        items: [makeRepo({ stargazersCount: 0 })],
      })

      const result = await service.runDailyDigest()

      expect(result.status).toBe('published')
      expect(posts.create).toHaveBeenCalledTimes(1)
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

  describe('今日状态与自检', () => {
    it('今天还没有推荐时 pick 为 null，但开关状态如实返回', async () => {
      const { service } = createService({
        config: { DAILY_DIGEST_CRON_TOKEN: 'token-123' },
      })

      const status = await service.getStatusResponse()

      expect(status.pick).toBeNull()
      expect(status.enabled).toBe(true)
      expect(status.cronConfigured).toBe(true)
      expect(status.aiEnabled).toBe(true)
      // 日期键必须是 YYYY-MM-DD，前端靠它判断"这篇是不是今天的"
      expect(status.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      // 前端要靠这两个字段决定"立即生成"按钮灰不灰、以及灰了该写什么理由
      expect(status.publishHour).toBe(0)
      expect(status.canPublishNow).toBe(true)
    })

    it('publishHour 配 0 就按 0 生效，只有"没配"才用默认的 9 点', async () => {
      /**
       * 0 与"没配"必须区分开：校验规则里 `DAILY_DIGEST_PUBLISH_HOUR` 是
       * `@Min(0)`，也就是说 0 被明确允许。如果读配置时把 0 当成"没配好"
       * 退回默认值，用户配了 0 却按 9 点生效，界面只会说"还没到发布时间"。
       */
      const zero = await createService({
        config: { DAILY_DIGEST_PUBLISH_HOUR: '0' },
      }).service.getStatusResponse()
      expect(zero.publishHour).toBe(0)

      const unset = await createService({
        config: { DAILY_DIGEST_PUBLISH_HOUR: '' },
      }).service.getStatusResponse()
      expect(unset.publishHour).toBe(9)
    })

    it('没配令牌时 cronConfigured 为 false（这正是"配了却没生效"的常见原因）', async () => {
      const { service } = createService({})

      const status = await service.getStatusResponse()

      expect(status.cronConfigured).toBe(false)
    })

    it('今天已发过时带上推荐信息，且绝不返回令牌明文', async () => {
      const { service } = createService({
        existing: {
          date: 'x',
          fullName: 'acme/demo',
          htmlUrl: 'https://github.com/acme/demo',
          language: 'TypeScript',
          stargazersCount: 1234,
          postId: 'post-1',
          source: 'ai',
        },
        config: { DAILY_DIGEST_CRON_TOKEN: 'super-secret-token' },
      })

      const status = await service.getStatusResponse()

      expect(status.pick?.fullName).toBe('acme/demo')
      expect(status.pick?.postId).toBe('post-1')
      expect(status.pick?.source).toBe('ai')
      // 自检只能说"配没配"，绝不能把令牌本身带出去
      expect(JSON.stringify(status)).not.toContain('super-secret-token')
    })
  })

  describe('访客生成的发布时间闸门', () => {
    // hour < 23，所以 hour + 1 一定是个合法的"还没到点"
    const { zone, hour } = pickZoneBeforeMidnight()
    const base = { DAILY_DIGEST_TIMEZONE: zone }

    it('未到发布时间：什么都不做，但状态里说得清几点才行', async () => {
      const publishHour = hour + 1
      const { service, github, posts } = createService({
        config: { ...base, DAILY_DIGEST_PUBLISH_HOUR: String(publishHour) },
      })

      await service.runDailyDigestByVisitor()

      expect(github.getTrending).not.toHaveBeenCalled()
      expect(posts.create).not.toHaveBeenCalled()

      const status = await service.getStatusResponse()
      expect(status.canPublishNow).toBe(false)
      expect(status.publishHour).toBe(publishHour)
    })

    it('已过发布时间：正常发布', async () => {
      const { service, posts } = createService({
        config: { ...base, DAILY_DIGEST_PUBLISH_HOUR: String(hour) },
      })

      await service.runDailyDigestByVisitor()

      expect(posts.create).toHaveBeenCalledTimes(1)
    })

    it('闸门不看 lazyTrigger：用户明确点了按钮，不该被"惰性触发"开关连坐', async () => {
      const { service, posts } = createService({
        config: {
          ...base,
          DAILY_DIGEST_PUBLISH_HOUR: String(hour),
          DAILY_DIGEST_LAZY_TRIGGER: 'false',
        },
      })

      await service.runDailyDigestByVisitor()

      expect(posts.create).toHaveBeenCalledTimes(1)
    })

    it('装置关闭时点按钮也不发', async () => {
      const { service, github } = createService({
        config: {
          DAILY_DIGEST_ENABLED: 'false',
          ...base,
          DAILY_DIGEST_PUBLISH_HOUR: String(hour),
        },
      })

      await service.runDailyDigestByVisitor()

      expect(github.getTrending).not.toHaveBeenCalled()
    })

    it('Cron 路径不受闸门约束：还没到发布时间，Cron 打进来照样发', async () => {
      // 闸门只加在访客那条路径上。如果哪天有人把它挪进 runDailyDigest，
      // 就会出现"Cron 按时打进来却什么都不发"的哑失败 —— 这条用例就是拦它的
      const { service, posts } = createService({
        config: { ...base, DAILY_DIGEST_PUBLISH_HOUR: String(hour + 1) },
      })

      await service.runDailyDigest()

      expect(posts.create).toHaveBeenCalledTimes(1)
    })
  })

  describe('撤回', () => {
    const PUBLISHED_PICK = {
      date: TODAY,
      repoId: 42,
      fullName: 'acme/demo',
      htmlUrl: 'https://github.com/acme/demo',
      language: 'TypeScript',
      stargazersCount: 500,
      postId: 'post-1',
      source: 'ai',
    }

    it('写排除表、删帖、级联删互动，并释放当天名额', async () => {
      const { service, exclude, posts, comments, likes, model } = createService({
        existing: PUBLISHED_PICK,
        commentsDeleted: 2,
        likesDeleted: 3,
      })

      const result = await service.runRevoke()

      expect(result.status).toBe('revoked')
      expect(result.date).toBe(TODAY)
      expect(result.removed).toEqual({ comments: 2, likes: 3 })

      // 最重要的一条：被撤的项目必须进排除表，否则明天它又会被选回来
      expect(exclude.updateOne).toHaveBeenCalledWith(
        { repoId: 42 },
        expect.objectContaining({ $set: expect.objectContaining({ fullName: 'acme/demo' }) }),
        { upsert: true },
      )

      expect(posts.remove).toHaveBeenCalledWith('post-1', expect.anything())
      expect(comments.deleteByPost).toHaveBeenCalledWith('post-1')
      expect(likes.deleteByPost).toHaveBeenCalledWith('post-1')
      expect(model.deleteOne).toHaveBeenCalledWith({ date: TODAY })
    })

    it('顺序：释放名额必须排在最后', async () => {
      /**
       * 顺序写错不会报错，只会让"中途崩溃"停在一个会重复发布的中间态 ——
       * 那是一种没有任何日志提示的坏法，所以拿顺序本身当断言。
       */
      const order: string[] = []
      const { service, exclude, model, posts, comments, likes } = createService({
        existing: PUBLISHED_PICK,
      })

      exclude.updateOne.mockImplementation(() => {
        order.push('排除表')
        return Promise.resolve({ acknowledged: true })
      })
      posts.remove.mockImplementation(() => {
        order.push('删帖')
        return Promise.resolve(undefined)
      })
      comments.deleteByPost.mockImplementation(() => {
        order.push('删评论')
        return Promise.resolve(0)
      })
      likes.deleteByPost.mockImplementation(() => {
        order.push('删点赞')
        return Promise.resolve(0)
      })
      model.deleteOne.mockImplementation(() => {
        order.push('释放名额')
        return Promise.resolve({ deletedCount: 1 })
      })

      await service.runRevoke()

      expect(order).toEqual(['排除表', '删帖', '删评论', '删点赞', '释放名额'])
    })

    it('已撤回过：返回 already-revoked 而不是报错（幂等）', async () => {
      const { service, model } = createService({
        existing: null,
        existingExclude: {
          fullName: 'acme/demo',
          htmlUrl: 'https://github.com/acme/demo',
          postId: 'post-1',
        },
      })

      const result = await service.runRevoke()

      expect(result.status).toBe('already-revoked')
      expect(result.repo?.fullName).toBe('acme/demo')
      // 已经撤过了就不该再动任何东西
      expect(model.deleteOne).not.toHaveBeenCalled()
    })

    it('当天本来就没有报道：返回 no-pick，多半是日期敲错了', async () => {
      const { service } = createService({ existing: null, existingExclude: null })

      const result = await service.runRevoke('2026-01-01')

      expect(result.status).toBe('no-pick')
      expect(result.date).toBe('2026-01-01')
    })

    it('帖子已经不在时仍然完成撤回（否则名额永远释放不出来）', async () => {
      const { service, model, posts } = createService({ existing: PUBLISHED_PICK })
      posts.remove.mockRejectedValueOnce(new Error('找不到该帖子'))

      const result = await service.runRevoke()

      expect(result.status).toBe('revoked')
      expect(model.deleteOne).toHaveBeenCalled()
    })

    it('被撤回过的项目不会再被推荐', async () => {
      const { service, posts } = createService({
        items: [makeRepo({ id: 7, stargazersCount: 999 })],
        excludedRepoIds: [7],
      })

      const result = await service.runDailyDigest()

      expect(result.status).toBe('no-candidate')
      expect(posts.create).not.toHaveBeenCalled()
    })
  })
})
