import { VectorStoreService } from './vector-store.service'

/** find().lean().exec() 链式替身，返回固定行 */
function createStore(rows: Array<{ postId: string; model: string; vector: number[] }>) {
  const modelStub = {
    find: jest.fn().mockReturnValue({
      lean: () => ({
        exec: () =>
          Promise.resolve(rows.map((r) => ({ ...r, _id: r.postId }))),
      }),
    }),
  }
  // 该服务只依赖这一个 Model，直接 new（与 posts.service.spec 同款风格）
  const service = new VectorStoreService(
    modelStub as never,
    { get: () => 'test/model' } as never,
  )
  return { service, modelStub }
}

const v = (...nums: number[]) => Float32Array.from(nums)

describe('VectorStoreService', () => {
  it('按点积降序返回 topK', async () => {
    const { service } = createStore([
      { postId: 'a', model: 'test/model', vector: [0, 1] },
      { postId: 'b', model: 'test/model', vector: [1, 0] },
      { postId: 'c', model: 'test/model', vector: [0.6, 0.8] },
    ])

    const hits = await service.search(v(0.8, 0.6), { topK: 2 })

    expect(hits.map((h) => h.postId)).toEqual(['c', 'b'])
    // 0.8*0.6 + 0.6*0.8 = 0.96
    expect(hits[0].score).toBeCloseTo(0.96)
  })

  it('排除与当前模型不一致的记录（混库防线）', async () => {
    const { service } = createStore([
      { postId: 'new', model: 'test/model', vector: [1, 0] },
      { postId: 'old', model: 'legacy/model', vector: [1, 0] },
    ])

    const hits = await service.search(v(1, 0), { currentModel: 'test/model' })

    expect(hits.map((h) => h.postId)).toEqual(['new'])
  })

  it('put 立即进缓存、remove 立即生效，不等 TTL', async () => {
    const { service } = createStore([])

    service.put('x', [1, 0], 'test/model')
    expect(await service.search(v(1, 0))).toHaveLength(1)

    service.remove('x')
    expect(await service.search(v(1, 0))).toHaveLength(0)
    expect(service.size).toBe(0)
  })

  it('markStale 之后重新从库载入', async () => {
    const { service, modelStub } = createStore([{ postId: 'a', model: 'test/model', vector: [1, 0] }])
    await service.search(v(1, 0))
    expect(modelStub.find).toHaveBeenCalledTimes(1)

    service.markStale()
    await service.search(v(1, 0))
    expect(modelStub.find).toHaveBeenCalledTimes(2)
  })

  it('数据库读失败时降级为空结果而不是抛异常', async () => {
    const badModel = {
      find: () => ({ lean: () => ({ exec: () => Promise.reject(new Error('db down')) }) }),
    }
    const service = new VectorStoreService(badModel as never, { get: () => 'm' } as never)

    await expect(service.search(v(1, 0))).resolves.toEqual([])
  })
})
