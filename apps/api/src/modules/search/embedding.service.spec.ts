import { EmbeddingService, buildEmbeddingText, l2Normalize } from './embedding.service'

describe('buildEmbeddingText', () => {
  it('拼接标题、摘要与正文，缺摘要时跳过空行', () => {
    expect(buildEmbeddingText({ title: 'T', content: 'C' })).toBe('T\nC')
    expect(buildEmbeddingText({ title: 'T', summary: 'S', content: 'C' })).toBe('T\nS\nC')
  })

  it('总长截断到 2000 字符', () => {
    const text = buildEmbeddingText({ title: 'T', content: 'x'.repeat(5000) })
    expect(text.length).toBeLessThanOrEqual(2001) // 2000 + 换行
    expect(text.startsWith('T\n')).toBe(true)
  })
})

describe('l2Normalize', () => {
  it('归一化后范数为 1', () => {
    const out = l2Normalize([3, 4])
    expect(out[0]).toBeCloseTo(0.6)
    expect(out[1]).toBeCloseTo(0.8)
  })

  it('零范数输入不产生 NaN（Review Focus #4）', () => {
    const out = l2Normalize([0, 0])
    expect(out.every(Number.isFinite)).toBe(true)
  })
})

describe('EmbeddingService.syncForPost', () => {
  function createService(options: { embed?: jest.Mock } = {}) {
    const embed = options.embed ?? jest.fn().mockResolvedValue([[1, 0]])
    const client = { enabled: true, embed, currentEmbedModel: 'test/model' }
    const model = {
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      deleteOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    }
    const store = { put: jest.fn(), remove: jest.fn() }
    const service = new EmbeddingService(
      client as never,
      store as never,
      model as never,
    )
    return { service, embed, model, store }
  }

  it('embed → 归一化 → upsert 入库 → 写端即时进缓存', async () => {
    const { service, embed, model, store } = createService()

    const ok = await service.syncForPost({ id: 'p1', title: 'T', content: 'C' })

    expect(ok).toBe(true)
    expect(embed).toHaveBeenCalledWith(['T\nC'])
    expect(model.updateOne).toHaveBeenCalledWith(
      { postId: 'p1' },
      expect.objectContaining({
        $set: expect.objectContaining({ model: 'test/model', dim: 2 }),
      }),
      { upsert: true },
    )
    expect(store.put).toHaveBeenCalledWith('p1', [1, 0], 'test/model')
  })

  it('embed 失败返回 false 且不抛（旁路纪律，Review Focus #5）', async () => {
    const { service, store } = createService({
      embed: jest.fn().mockRejectedValue(new Error('410 gone')),
    })

    await expect(service.syncForPost({ id: 'p1', title: 'T', content: 'C' })).resolves.toBe(false)
    expect(store.put).not.toHaveBeenCalled()
  })

  it('AI 未启用时静默跳过', async () => {
    const client = { enabled: false }
    const service = new EmbeddingService(client as never, {} as never, {} as never)

    await expect(service.syncForPost({ id: 'p1', title: 'T', content: 'C' })).resolves.toBe(false)
  })
})
