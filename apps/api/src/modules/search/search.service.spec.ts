import { SearchService } from './search.service'

function createService(options: {
  enabled?: boolean
  embedQuery?: jest.Mock
  hits?: Array<{ postId: string; score: number }>
  posts?: Array<Record<string, unknown>>
} = {}) {
  const embeddingStub = {
    enabled: options.enabled ?? true,
    embedQuery: options.embedQuery ?? jest.fn().mockResolvedValue(Float32Array.from([1, 0])),
  }
  const storeStub = {
    search: jest.fn().mockResolvedValue(options.hits ?? []),
    remove: jest.fn(),
    size: 0,
  }
  const postModelStub = {
    find: jest.fn().mockReturnValue({
      lean: () => ({ exec: () => Promise.resolve(options.posts ?? []) }),
    }),
  }
  const clientStub = { currentEmbedModel: 'test/model' }
  const service = new SearchService(
    embeddingStub as never,
    storeStub as never,
    postModelStub as never,
    clientStub as never,
  )
  return { service, embeddingStub, storeStub, postModelStub }
}

describe('SearchService.semanticSearch', () => {
  it('AI 未配置时返回 not-configured 而不抛', async () => {
    const { service } = createService({ enabled: false })
    const res = await service.semanticSearch('任意问题')
    expect(res).toEqual({ results: [], reason: 'not-configured' })
  })

  it('查询向量生成失败时返回 error', async () => {
    const { service } = createService({ embedQuery: jest.fn().mockResolvedValue(null) })
    const res = await service.semanticSearch('任意问题')
    expect(res.reason).toBe('error')
  })

  it('向量库为空时返回 index-empty', async () => {
    const { service } = createService({ hits: [] })
    const res = await service.semanticSearch('任意问题')
    expect(res).toEqual({ results: [], reason: 'index-empty' })
  })

  it('过滤孤儿向量并顺手从缓存剔除（Review Focus #2）', async () => {
    const { service, storeStub } = createService({
      hits: [
        { postId: 'alive', score: 0.9 },
        { postId: 'ghost', score: 0.8 },
      ],
      posts: [
        {
          _id: 'alive',
          title: 'T',
          content: 'C',
          tags: [],
          summary: null,
          aiTags: [],
          author: { id: 'u1', username: 'n' },
          likeCount: 0,
          commentCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          __v: 0,
        },
      ],
    })

    const res = await service.semanticSearch('任意问题')

    expect(res.results.map((r) => r.post.id)).toEqual(['alive'])
    expect(res.reason).toBeNull()
    expect(storeStub.remove).toHaveBeenCalledWith('ghost')
  })

  it('检索时按当前 embedding 模型过滤混库记录（Review Focus #3）', async () => {
    const { service, storeStub } = createService()
    await service.semanticSearch('q')
    expect(storeStub.search).toHaveBeenCalledWith(
      expect.any(Float32Array),
      { currentModel: 'test/model' },
    )
  })
})
