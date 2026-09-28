import { SearchService } from './search.service'
import { buildAskPostsPrompt } from './prompts/ask-posts.prompt'

function createRig(options: {
  hits?: Array<{ postId: string; score: number }>
  cached?: { answer: string; sources: string[] } | null
  quotaAllowed?: boolean
} = {}) {
  const chat = jest.fn().mockResolvedValue('答案 [1]')
  const embeddingStub = {
    enabled: true,
    embedQuery: jest.fn().mockResolvedValue(Float32Array.from([1, 0])),
  }
  const storeStub = {
    search: jest.fn().mockResolvedValue(options.hits ?? [{ postId: 'p1', score: 0.9 }]),
    remove: jest.fn(),
  }
  const postDoc = {
    _id: 'p1', title: 'Nest 入门', content: '正文', tags: [], summary: '摘要',
    aiTags: [], author: { id: 'u1', username: 'n' }, likeCount: 0, commentCount: 0,
    createdAt: new Date(), updatedAt: new Date(), __v: 0,
  }
  const postModelStub = {
    find: jest.fn().mockReturnValue({ lean: () => ({ exec: () => Promise.resolve([postDoc]) }) }),
    findById: jest.fn().mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(postDoc) }) }),
  }
  const aiStub = {
    getCachedAnswer: jest.fn().mockResolvedValue(options.cached ?? null),
    cacheAnswer: jest.fn().mockResolvedValue(undefined),
    tryConsumeQuota: jest
      .fn()
      .mockResolvedValue({ allowed: options.quotaAllowed ?? true, remaining: 42 }),
    getStatus: jest.fn().mockResolvedValue({ remainingToday: 42 }),
  }
  const clientStub = { currentEmbedModel: 'test/model', chat }

  const service = new SearchService(
    embeddingStub as never, storeStub as never, postModelStub as never,
    clientStub as never, aiStub as never,
  )
  return { service, chat, aiStub, embeddingStub }
}

describe('SearchService.askPosts', () => {
  it('检索为空时短路 no-sources，一个字都不问模型（防幻觉 + 省额度）', async () => {
    const { service, chat } = createRig({ hits: [] })

    const res = await service.askPosts('站内没有的话题')

    expect(res.reason).toBe('no-sources')
    expect(chat).not.toHaveBeenCalled()
  })

  it('额度耗尽时返回 quota-exceeded，不调模型', async () => {
    const { service, chat } = createRig({ quotaAllowed: false })

    const res = await service.askPosts('Nest 怎么学')

    expect(res.reason).toBe('quota-exceeded')
    expect(chat).not.toHaveBeenCalled()
  })

  it('命中缓存时不耗额度不调模型', async () => {
    const { service, chat, aiStub } = createRig({ cached: { answer: '旧答案', sources: ['p1'] } })

    const res = await service.askPosts('Nest 怎么学')

    expect(res).toMatchObject({ answer: '旧答案', cached: true, reason: null })
    expect(chat).not.toHaveBeenCalled()
    expect(aiStub.tryConsumeQuota).not.toHaveBeenCalled()
  })

  it('成功路径：answer + 来源与 [n] 编号同序 + 写缓存', async () => {
    const { service, aiStub } = createRig()

    const res = await service.askPosts('Nest 怎么学')

    expect(res.answer).toBe('答案 [1]')
    expect(res.sources).toEqual([{ postId: 'p1', title: 'Nest 入门', score: 0.9 }])
    expect(aiStub.cacheAnswer).toHaveBeenCalledWith(
      expect.any(String), '答案 [1]', ['p1'],
    )
  })

  it('prompt 包含编号材料、引用要求与「资料不足要明说」', () => {
    const prompt = buildAskPostsPrompt({
      question: 'Nest 怎么学',
      posts: [{ id: 'p1', title: 'Nest 入门', summary: '摘要', content: '正文' }],
    })
    expect(prompt).toContain('[1] Nest 入门')
    expect(prompt).toContain('Nest 怎么学')
    expect(prompt).toContain('只依据')
  })
})
