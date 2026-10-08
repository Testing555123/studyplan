import { ConfigService } from '@nestjs/config'
import { AiService } from './ai.service'
import type { CodeIndexService } from './code-index.service'
import type { NvNimClient } from './nv-nim.client'

/**
 * AiService 的单元测试。
 *
 * ⚠️ 这里**刻意不真的调用模型**：那需要网络与有效 Key，
 *   会让测试变慢、因网络抖动偶发失败，还会真花钱。
 *
 * 我们测的是真正容易出错、且手测不出来的部分：
 *   · 未配置 Key 时是否正确降级（而不是抛异常）
 *   · 缓存命中时是否真的不消耗额度
 *   · 额度耗尽时是否给出 'quota-exceeded' 而不是 500
 *   · 上游报错时是否被收敛成 reason
 *   · 模型返回非 JSON 文本时摘要生成是否会崩
 */

function createConfigStub(values: Record<string, string | undefined> = {}): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService
}

/** 伪造 NIM 客户端：可指定是否启用，以及 chat 的行为 */
function createClientStub(options: {
  enabled: boolean
  chat?: () => Promise<string>
}): NvNimClient {
  return {
    enabled: options.enabled,
    currentModel: 'test/model-001',
    chat: jest.fn(options.chat ?? (() => Promise.resolve('这是模型给出的回答'))),
  } as unknown as NvNimClient
}

/** 伪造代码索引：固定返回一条，方便断言 sources */
function createCodeIndexStub(): CodeIndexService {
  return {
    search: jest.fn(() =>
      Promise.resolve([
        { path: 'apps/api/src/main.ts', pkg: 'api', exports: ['bootstrap'], summary: '应用入口' },
      ]),
    ),
    loaded: true,
    fileCount: 4,
  } as unknown as CodeIndexService
}

/**
 * 伪造用量 Model。
 * `count` 决定当前已用次数，配合 limit 就能造出"额度耗尽"的场景。
 */
function createUsageModelStub(used: number) {
  return {
    findOne: jest
      .fn()
      .mockReturnValue({ lean: () => Promise.resolve({ date: '2026-01-01', count: used }) }),
    updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
  }
}

/** 伪造答案缓存 Model：命中与否由 hit 控制 */
function createCacheModelStub(hit: { answer: string; sources: string[] } | null) {
  return {
    findOne: jest.fn().mockReturnValue({
      lean: () =>
        Promise.resolve(
          hit === null
            ? null
            : { hash: 'x', answer: hit.answer, sources: hit.sources, createdAt: new Date() },
        ),
    }),
    updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
  }
}

function createService(options: {
  enabled: boolean
  used?: number
  cacheHit?: { answer: string; sources: string[] } | null
  chat?: () => Promise<string>
  dailyLimit?: string
}) {
  const usage = createUsageModelStub(options.used ?? 0)
  const cache = createCacheModelStub(options.cacheHit ?? null)
  const client = createClientStub({ enabled: options.enabled, chat: options.chat })

  const service = new AiService(
    client,
    createCodeIndexStub(),
    usage as never,
    cache as never,
    createConfigStub({ NVNIM_DAILY_LIMIT: options.dailyLimit }),
  )

  return { service, client, usage, cache }
}

describe('AiService', () => {
  describe('未配置 API Key 时', () => {
    it('enabled 为 false', () => {
      expect(createService({ enabled: false }).service.enabled).toBe(false)
    })

    it('answerQuestion 返回 not-configured，而不是抛异常', async () => {
      const { service } = createService({ enabled: false })

      const result = await service.answerQuestion({ question: '这段代码什么意思' })

      expect(result.answer).toBeNull()
      expect(result.reason).toBe('not-configured')
    })

    it('generatePostMeta 返回 null（发帖链路不受影响）', async () => {
      const { service } = createService({ enabled: false })

      await expect(service.generatePostMeta({ title: '标题', content: '正文' })).resolves.toBeNull()
    })

    it('构造时不会因为缺 Key 而抛错（AI 是增强功能，不是核心依赖）', () => {
      expect(() => createService({ enabled: false })).not.toThrow()
    })
  })

  describe('额度与缓存', () => {
    it('缓存命中时不调用模型，也不消耗额度', async () => {
      const { service, client, usage } = createService({
        enabled: true,
        cacheHit: { answer: '缓存里的答案', sources: [] },
      })

      const result = await service.answerQuestion({ question: '什么是 SSR' })

      expect(result.cached).toBe(true)
      expect(result.answer).toBe('缓存里的答案')
      expect(client.chat).not.toHaveBeenCalled()
      expect(usage.updateOne).not.toHaveBeenCalled()
    })

    it('额度耗尽时返回 quota-exceeded，且不调用模型', async () => {
      // 已用 300 = 上限 300，正好耗尽
      const { service, client } = createService({ enabled: true, used: 300, dailyLimit: '300' })

      const result = await service.answerQuestion({ question: '什么是 SSR' })

      expect(result.answer).toBeNull()
      expect(result.reason).toBe('quota-exceeded')
      expect(result.remainingToday).toBe(0)
      expect(client.chat).not.toHaveBeenCalled()
    })

    it('正常提问：调用模型，并带上代码索引命中的文件路径', async () => {
      const { service, client } = createService({ enabled: true, used: 0 })

      const result = await service.answerQuestion({ question: 'main.ts 做了什么' })

      expect(client.chat).toHaveBeenCalledTimes(1)
      expect(result.answer).toBe('这是模型给出的回答')
      expect(result.cached).toBe(false)
      expect(result.sources).toEqual(['apps/api/src/main.ts'])
    })

    it('带项目上下文时不去检索本站代码（避免干扰模型）', async () => {
      const { service } = createService({ enabled: true })

      const result = await service.answerQuestion({
        question: '这个项目值得学吗',
        context: {
          type: 'repo',
          fullName: 'nestjs/nest',
          description: '一个 Node 框架',
          language: 'TypeScript',
          htmlUrl: 'https://github.com/nestjs/nest',
        },
      })

      expect(result.sources).toEqual([])
    })
  })

  describe('进程内热层（批次 2：lru-cache 替手写缓存）', () => {
    /** 7 天 + 1 毫秒，越过 ANSWER_CACHE_TTL_MS */
    const TTL_PLUS_ONE_MS = 7 * 24 * 60 * 60 * 1000 + 1

    it('同一个问题第二次提问不再查缓存表', async () => {
      const { service, cache, client } = createService({ enabled: true, cacheHit: null })

      await service.answerQuestion({ question: '什么是 SSR' })
      const second = await service.answerQuestion({ question: '什么是 SSR' })

      expect(client.chat).toHaveBeenCalledTimes(1)
      // 第一次读了库（未命中），第二次必须由进程内热层直接接住
      expect(cache.findOne).toHaveBeenCalledTimes(1)
      expect(second.cached).toBe(true)
      expect(second.answer).toBe('这是模型给出的回答')
    })

    it('热层命中同样不消耗额度', async () => {
      const { service, usage } = createService({ enabled: true, cacheHit: null })

      await service.answerQuestion({ question: '什么是 SSR' })
      await service.answerQuestion({ question: '什么是 SSR' })

      // 只有第一次真实调用模型时计一次数
      expect(usage.updateOne).toHaveBeenCalledTimes(1)
    })

    it('热层命中时仍然把答案落库（落库才是跨实例的那一层）', async () => {
      const { service, cache } = createService({ enabled: true, cacheHit: null })

      await service.answerQuestion({ question: '什么是 SSR' })

      expect(cache.updateOne).toHaveBeenCalledTimes(1)
    })

    it('超过 7 天后回源重取（进程内条目不能永生）', async () => {
      jest.useFakeTimers()
      try {
        const { service, client } = createService({ enabled: true, cacheHit: null })

        await service.answerQuestion({ question: '什么是 SSR' })
        jest.advanceTimersByTime(TTL_PLUS_ONE_MS)
        await service.answerQuestion({ question: '什么是 SSR' })

        expect(client.chat).toHaveBeenCalledTimes(2)
      } finally {
        jest.useRealTimers()
      }
    })

    it('换个问题不会串到上一个答案（键空间按问题指纹隔离）', async () => {
      const { service, client } = createService({ enabled: true, cacheHit: null })

      await service.answerQuestion({ question: '什么是 SSR' })
      await service.answerQuestion({ question: '什么是客户端渲染' })

      expect(client.chat).toHaveBeenCalledTimes(2)
    })

    it('同一问题但不同项目上下文，不共用同一条缓存', async () => {
      const { service, client } = createService({ enabled: true, cacheHit: null })

      await service.answerQuestion({ question: '值得学吗' })
      await service.answerQuestion({
        question: '值得学吗',
        context: {
          type: 'repo',
          fullName: 'nestjs/nest',
          description: '一个 Node 框架',
          language: 'TypeScript',
          htmlUrl: 'https://github.com/nestjs/nest',
        },
      })

      expect(client.chat).toHaveBeenCalledTimes(2)
    })
  })

  describe('上游失败时', () => {
    it('被收敛成 reason=error，不抛异常', async () => {
      const { service } = createService({
        enabled: true,
        chat: () => Promise.reject(new Error('模型「x」已下线或不存在')),
      })

      const result = await service.answerQuestion({ question: '什么是 SSR' })

      expect(result.answer).toBeNull()
      expect(result.reason).toBe('error')
    })

    it('上游限流单独标记为 rate-limited（用户稍等可重试）', async () => {
      const { service } = createService({
        enabled: true,
        chat: () => Promise.reject(new Error('AI 服务限流（请求过于频繁），请稍后再试')),
      })

      const result = await service.answerQuestion({ question: '什么是 SSR' })

      expect(result.reason).toBe('rate-limited')
    })
  })

  describe('generatePostMeta', () => {
    it('模型返回带 Markdown 包裹的 JSON 时仍能解析', async () => {
      const { service } = createService({
        enabled: true,
        chat: () =>
          Promise.resolve('```json\n{"summary": "这是一句摘要", "tags": ["NestJS"]}\n```'),
      })

      const meta = await service.generatePostMeta({ title: '标题', content: '正文' })

      expect(meta).toEqual({ summary: '这是一句摘要', tags: ['NestJS'] })
    })

    it('模型返回的不是 JSON 时降级为 null，不抛异常', async () => {
      const { service } = createService({
        enabled: true,
        chat: () => Promise.resolve('抱歉，我无法完成这个任务'),
      })

      await expect(service.generatePostMeta({ title: '标题', content: '正文' })).resolves.toBeNull()
    })
  })

  describe('getStatus', () => {
    it('返回启用状态、模型名与剩余额度', async () => {
      const { service } = createService({ enabled: true, used: 42, dailyLimit: '300' })

      const status = await service.getStatus()

      expect(status.enabled).toBe(true)
      expect(status.model).toBe('test/model-001')
      expect(status.limitPerDay).toBe(300)
      expect(status.remainingToday).toBe(258)
      // 自检字段：enabled 与 keyConfigured 同源（都来自 client.enabled），
      // 不做第二个事实来源；索引状态以"文件数 > 0"为准
      expect(status.keyConfigured).toBe(true)
      expect(status.codeIndexLoaded).toBe(true)
      expect(status.codeIndexFiles).toBe(4)
    })

    it('未配置 Key 时 enabled 与 keyConfigured 同为 false', async () => {
      const { service } = createService({ enabled: false })

      const status = await service.getStatus()

      expect(status.enabled).toBe(false)
      expect(status.keyConfigured).toBe(false)
    })
  })
})
