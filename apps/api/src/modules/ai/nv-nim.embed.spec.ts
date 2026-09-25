import { ConfigService } from '@nestjs/config'
import { NvNimClient } from './nv-nim.client'

function createClient(values: Record<string, string | undefined> = {}): NvNimClient {
  const config = { get: (key: string) => values[key] } as unknown as ConfigService
  return new NvNimClient(config)
}

const originalFetch = global.fetch

describe('NvNimClient.embed', () => {
  afterEach(() => {
    global.fetch = originalFetch
  })

  it('未配置 Key 时抛可诊断错误', async () => {
    await expect(createClient().embed(['hi'])).rejects.toThrow('AI 功能未启用')
  })

  it('批量输入按 index 对齐返回向量，请求体带 model 与 input 数组', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { index: 1, embedding: [0, 1] },
          { index: 0, embedding: [1, 0] },
        ],
      }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const client = createClient({ NVNIM_API_KEY: 'k', NVNIM_EMBED_MODEL: 'test/embed' })
    const vectors = await client.embed(['a', 'b'])

    // 乱序返回也必须按 index 排回输入顺序
    expect(vectors).toEqual([
      [1, 0],
      [0, 1],
    ])
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(body.model).toBe('test/embed')
    expect(body.input).toEqual(['a', 'b'])
  })

  it('410 时提示更换 NVNIM_EMBED_MODEL 而不是 NVNIM_MODEL', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 410,
      statusText: 'Gone',
    }) as unknown as typeof fetch

    const client = createClient({ NVNIM_API_KEY: 'k', NVNIM_EMBED_MODEL: 'old/model' })
    await expect(client.embed(['a'])).rejects.toThrow('NVNIM_EMBED_MODEL')
  })

  it('上游返回空 data 视为失败', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    }) as unknown as typeof fetch

    const client = createClient({ NVNIM_API_KEY: 'k' })
    await expect(client.embed(['a'])).rejects.toThrow('向量')
  })
})
