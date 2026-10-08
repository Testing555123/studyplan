import { ConfigService } from '@nestjs/config'
import { GithubClient, GITHUB_SEARCH_PER_PAGE, README_MAX_CHARS } from './github.client'

/**
 * GithubClient 的单元测试（批次 2：Octokit 替 259 行手写 fetch）。
 *
 * 这个类以前**一行测试都没有**：它是全模块唯一真正出网的地方，
 * 手测要么真打 GitHub，要么断网，两种都测不出降级链。
 *
 * 替换成 Octokit 之后，网络边界被收进 `@octokit/rest` 这一个符号，
 * 于是可以只在**那一层**做替身，其余全部走真代码：
 *   · 查询串的拼法（`created:>=` / sort / per_page）
 *   · snake_case → 契约 camelCase 的映射
 *   · 403 与超时会被转成什么样的错误
 *   · 哪些失败返回 null（可选能力），哪些失败往上抛
 *
 * 最后一条断言是这次替换的**验收本身**：`globalThis.fetch` 一次都不许被调用。
 * 哪天有人把裸 fetch 加回来，这里立刻红。
 */

jest.mock('@octokit/rest', () => {
  const constructOptions: Array<Record<string, unknown>> = []
  const searchRepos = jest.fn()
  const reposGet = jest.fn()
  const reposGetReadme = jest.fn()

  class OctokitStub {
    constructor(options: Record<string, unknown>) {
      constructOptions.push(options)
    }
    search = { repos: searchRepos }
    repos = { get: reposGet, getReadme: reposGetReadme }
  }

  return {
    Octokit: OctokitStub,
    __octokitProbe: { constructOptions, searchRepos, reposGet, reposGetReadme },
  }
})

/** 拿到替身内部的探针 */
function probe() {
  const mod = jest.requireMock('@octokit/rest') as {
    __octokitProbe: {
      constructOptions: Array<Record<string, unknown>>
      searchRepos: jest.Mock
      reposGet: jest.Mock
      reposGetReadme: jest.Mock
    }
  }
  return mod.__octokitProbe
}

/** GitHub 原始响应里的一条仓库记录（只写用到的字段） */
function rawItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 123,
    full_name: 'vuejs/core',
    name: 'core',
    owner: { login: 'vuejs', avatar_url: 'https://avatars/vuejs' },
    html_url: 'https://github.com/vuejs/core',
    homepage: 'https://vuejs.org',
    description: 'Vue 框架',
    language: 'TypeScript',
    topics: ['vue', 'framework'],
    stargazers_count: 5000,
    forks_count: 900,
    open_issues_count: 40,
    created_at: '2026-01-02T00:00:00Z',
    pushed_at: '2026-03-04T00:00:00Z',
    ...overrides,
  }
}

function createClient(values: Record<string, string | undefined> = {}): GithubClient {
  return new GithubClient({ get: (key: string) => values[key] } as unknown as ConfigService)
}

/** 造一个 Octokit 的 HttpError 形状（status + message） */
function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status })
}

describe('GithubClient', () => {
  let fetchSpy: jest.SpyInstance

  beforeEach(() => {
    // 任何一次真出网都让测试立刻失败，而不是慢慢等超时
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('不该出网'))
    probe().constructOptions.length = 0
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  describe('Octokit 的接线', () => {
    it('配置了 GITHUB_TOKEN 时把 token 交给 Octokit（认证与否由它负责）', () => {
      createClient({ GITHUB_TOKEN: 'ghp_test' })

      expect(probe().constructOptions[0]?.auth).toBe('ghp_test')
    })

    it('没配 token 时不传 auth，而不是传 null 或空串', () => {
      createClient()

      expect(probe().constructOptions[0]?.auth).toBeUndefined()
    })

    it('请求一律走 Octokit，不再自己拼 fetch', async () => {
      probe().searchRepos.mockResolvedValue({ data: { items: [] } })

      await createClient().searchTopNewRepos(new Date('2026-01-01T00:00:00Z'))

      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  describe('searchTopNewRepos', () => {
    it('按「某日期之后新建 + star 降序 + 每页 100」查询（Octokit v22 的参数名是 q）', async () => {
      probe().searchRepos.mockResolvedValue({ data: { items: [] } })

      await createClient().searchTopNewRepos(new Date('2026-01-05T09:30:00Z'))

      expect(probe().searchRepos).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'created:>=2026-01-05',
          sort: 'stars',
          order: 'desc',
          per_page: GITHUB_SEARCH_PER_PAGE,
        }),
      )
    })

    it('查询串刻意不带 language 限定符（语言在 Service 层过滤，省配额）', async () => {
      probe().searchRepos.mockResolvedValue({ data: { items: [] } })

      await createClient().searchTopNewRepos(new Date('2026-01-05T09:30:00Z'))

      expect(String(probe().searchRepos.mock.calls[0]?.[0]?.q)).not.toMatch(/language:/)
    })

    it('把 snake_case 映射成契约的 camelCase，字段一个都不丢', async () => {
      probe().searchRepos.mockResolvedValue({ data: { items: [rawItem()] } })

      const [repo] = await createClient().searchTopNewRepos(new Date('2026-01-01T00:00:00Z'))

      expect(repo).toEqual({
        id: 123,
        fullName: 'vuejs/core',
        name: 'core',
        ownerLogin: 'vuejs',
        ownerAvatarUrl: 'https://avatars/vuejs',
        htmlUrl: 'https://github.com/vuejs/core',
        homepage: 'https://vuejs.org',
        description: 'Vue 框架',
        language: 'TypeScript',
        topics: ['vue', 'framework'],
        stargazersCount: 5000,
        forksCount: 900,
        openIssuesCount: 40,
        createdAt: '2026-01-02T00:00:00Z',
        pushedAt: '2026-03-04T00:00:00Z',
      })
    })

    it('缺字段时给安全的默认值，而不是把 undefined 传下去', async () => {
      probe().searchRepos.mockResolvedValue({
        data: { items: [rawItem({ owner: null, topics: null, description: null })] },
      })

      const [repo] = await createClient().searchTopNewRepos(new Date('2026-01-01T00:00:00Z'))

      expect(repo?.ownerLogin).toBe('')
      expect(repo?.topics).toEqual([])
      expect(repo?.description).toBeNull()
    })

    it('响应里没有 items 时返回空数组（调用方的降级链要靠它，不是靠抛错）', async () => {
      probe().searchRepos.mockResolvedValue({ data: {} })

      await expect(
        createClient().searchTopNewRepos(new Date('2026-01-01T00:00:00Z')),
      ).resolves.toEqual([])
    })

    it('403 的错误信息里点明「可能是 Search API 限流」', async () => {
      probe().searchRepos.mockRejectedValue(httpError(403, 'Forbidden'))

      await expect(
        createClient().searchTopNewRepos(new Date('2026-01-01T00:00:00Z')),
      ).rejects.toThrow(/403.*限流|限流/)
    })

    it('上游错误保留状态码，不把「请求失败」这种没信息量的话抛出去', async () => {
      probe().searchRepos.mockRejectedValue(httpError(422, 'Validation Failed'))

      await expect(
        createClient().searchTopNewRepos(new Date('2026-01-01T00:00:00Z')),
      ).rejects.toThrow(/422/)
    })

    it('超时被转成一句能看懂的中文，且带上时限', async () => {
      probe().searchRepos.mockRejectedValue(
        Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
      )

      await expect(
        createClient().searchTopNewRepos(new Date('2026-01-01T00:00:00Z')),
      ).rejects.toThrow(/超时.*ms/)
    })
  })

  describe('fetchRepo（最后一级回退，失败返回 null）', () => {
    it('正常返回时映射成契约', async () => {
      probe().reposGet.mockResolvedValue({ data: rawItem() })

      const repo = await createClient().fetchRepo('vuejs/core')

      expect(repo?.fullName).toBe('vuejs/core')
      expect(probe().reposGet).toHaveBeenCalledWith(
        expect.objectContaining({ owner: 'vuejs', repo: 'core' }),
      )
    })

    it('上游报错时返回 null，让调用方继续降级而不是整页失败', async () => {
      probe().reposGet.mockRejectedValue(httpError(500, 'Server Error'))

      await expect(createClient().fetchRepo('vuejs/core')).resolves.toBeNull()
    })

    it('fullName 形状不对时直接 null，一次请求都不发', async () => {
      await expect(createClient().fetchRepo('not-a-full-name')).resolves.toBeNull()

      expect(probe().reposGet).not.toHaveBeenCalled()
    })
  })

  describe('fetchReadme（可选素材，失败返回 null）', () => {
    /** 把纯文本编成 GitHub 那套 base64 */
    function b64(text: string): string {
      return Buffer.from(text, 'utf8').toString('base64')
    }

    it('解码 base64 并去掉代码块、图片、链接 URL 与 HTML 标签', async () => {
      probe().reposGetReadme.mockResolvedValue({
        data: {
          encoding: 'base64',
          content: b64(
            '# 标题\n\n![badge](https://img/a.svg)\n\n```js\nnpm i x\n```\n\n看 [文档](https://doc.example) 吧<div align="center">x</div>',
          ),
        },
      })

      const readme = await createClient().fetchReadme('vuejs/core')

      expect(readme).toContain('看 文档 吧')
      expect(readme).not.toContain('npm i x')
      expect(readme).not.toContain('https://img')
      expect(readme).not.toContain('<div')
      expect(readme).not.toContain('# 标题')
    })

    it('清洗后截断到上限字符数（README 长度不可控，token 预算要守住）', async () => {
      probe().reposGetReadme.mockResolvedValue({
        data: { encoding: 'base64', content: b64('甲'.repeat(README_MAX_CHARS + 500)) },
      })

      const readme = await createClient().fetchReadme('vuejs/core')

      expect(readme).toHaveLength(README_MAX_CHARS)
    })

    it('编码不是 base64 时返回 null，绝不产出乱码', async () => {
      probe().reposGetReadme.mockResolvedValue({ data: { encoding: 'utf-8', content: '正文' } })

      await expect(createClient().fetchReadme('vuejs/core')).resolves.toBeNull()
    })

    it('没有 content 字段时返回 null', async () => {
      probe().reposGetReadme.mockResolvedValue({ data: { encoding: 'base64' } })

      await expect(createClient().fetchReadme('vuejs/core')).resolves.toBeNull()
    })

    it('README 不存在（404）时返回 null，报道退回官方描述', async () => {
      probe().reposGetReadme.mockRejectedValue(httpError(404, 'Not Found'))

      await expect(createClient().fetchReadme('vuejs/core')).resolves.toBeNull()
    })

    it('清洗后什么都不剩时返回 null（空素材对模型没有意义）', async () => {
      probe().reposGetReadme.mockResolvedValue({
        data: { encoding: 'base64', content: b64('```\nonly code\n```') },
      })

      await expect(createClient().fetchReadme('vuejs/core')).resolves.toBeNull()
    })
  })
})
