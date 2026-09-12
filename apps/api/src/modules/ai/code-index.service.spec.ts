/**
 * 代码索引检索的单测。
 *
 * 为什么这个文件值得存在？
 *   它守护的是两条**曾经真的坏过**、且失败方式极其隐蔽的规则：
 *
 *   ① 中文必须按 2 字滑窗切词。
 *      整段汉字（"榜单的数据是怎么缓存和降级的"）永远匹配不到任何
 *      文件路径，等于一个问题白问；而且不报错，只表现为"AI 答不出"。
 *
 *   ② 重复出现的词只能计一次分。
 *      "GitHub 榜单…请求 GitHub" 里的 `github` 曾因为出现两次而拿到双倍分，
 *      把同目录下真正实现了缓存的 github.service.ts 挤出了 topK。
 *
 *   这两条都不会让程序崩溃，只会让答案悄悄变差 —— 正是最需要测试兜住的那种缺陷。
 */
import { existsSync, readFileSync } from 'node:fs'
import { CodeIndexService } from './code-index.service'

jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}))

const mockExistsSync = existsSync as unknown as jest.Mock
const mockReadFileSync = readFileSync as unknown as jest.Mock

/** 一份贴近真实的迷你索引：同一模块下"实现文件"与"周边文件"并存 */
const MOCK_INDEX = [
  {
    path: 'apps/api/src/modules/github/github.service.ts',
    pkg: 'api',
    exports: ['GithubService'],
    summary: '热门项目榜的核心逻辑：缓存决策、语言聚合、降级。',
  },
  {
    path: 'apps/api/src/modules/github/github.controller.ts',
    pkg: 'api',
    exports: ['GithubController'],
    summary: '只做参数校验与转发，不含业务逻辑。',
  },
  {
    path: 'apps/api/src/modules/github/github.client.ts',
    pkg: 'api',
    exports: ['GithubClient'],
    summary: '唯一知道上游长什么样的地方：拼查询、设请求头、超时中断。',
  },
  {
    path: 'apps/web/app/pages/index.vue',
    pkg: 'web',
    exports: [],
    summary: '首页帖子流。',
  },
]

function createService(): CodeIndexService {
  return new CodeIndexService()
}

describe('CodeIndexService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify(MOCK_INDEX))
  })

  it('中文问题能命中实现文件，而不是同目录的周边文件', async () => {
    const matched = await createService().search('榜单的数据是怎么缓存和降级的？')

    expect(matched.length).toBeGreaterThan(0)
    expect(matched[0].path).toBe('apps/api/src/modules/github/github.service.ts')
  })

  it('问题里重复出现的词只计一次分，不会把无关文件顶上第一', async () => {
    // `github` 在这句话里出现三次：若按出现次数累加，
    // controller / client 这些"路径含 github 但摘要无关"的文件会被刷到并列第一
    const matched = await createService().search(
      'github 榜单的 github 缓存是怎么做的？再解释一下 github 的限流',
    )

    expect(matched[0].path).toBe('apps/api/src/modules/github/github.service.ts')
  })

  it('问题与索引完全无关时不返回任何文件', async () => {
    const matched = await createService().search('今天晚饭吃什么比较好呢')

    expect(matched).toEqual([])
  })

  it('索引文件缺失时返回空数组，且不抛异常', async () => {
    mockExistsSync.mockReturnValue(false)

    // AiService 的契约是"永远不抛异常"，索引缺失只能降级、不能把请求打挂
    await expect(createService().search('缓存是怎么设计的？')).resolves.toEqual([])
  })

  it('索引文件内容不是合法 JSON 时同样降级为空，不抛异常', async () => {
    mockReadFileSync.mockReturnValue('这不是 JSON')

    await expect(createService().search('缓存是怎么设计的？')).resolves.toEqual([])
  })

  it('topK 生效：默认最多返回 4 条', async () => {
    const matched = await createService().search('github 缓存 转发 上游 首页 帖子', 4)

    expect(matched.length).toBeLessThanOrEqual(4)
  })
})
