import { AI_SUMMARY_MAX_LENGTH, MAX_TAGS_PER_POST } from '@studyplan/shared'
import { describeError, redactApiKey, sanitizePostMeta } from './post-meta.sanitizer'

/**
 * AI 结果清洗的单元测试。
 *
 * 这个文件是"把纯逻辑从有副作用的方法里拔出来"的直接回报：
 * 它不需要网络、不需要 mock、跑一次几十毫秒，
 * 却把 AI 功能**最真实的风险**（调用成功但结果不可用）全部覆盖了。
 *
 * 对比一下：如果这段逻辑还留在 AiService 里，
 * 要测它就得先伪造一个模型客户端实例 —— 成本高到大多数人会放弃。
 */
describe('sanitizePostMeta', () => {
  it('正常输入：摘要与标签原样通过', () => {
    const result = sanitizePostMeta({
      summary: '本文用三个例子说明为什么读改写会产生竞态。',
      tags: ['MongoDB', '工程化'],
    })

    expect(result).toEqual({
      summary: '本文用三个例子说明为什么读改写会产生竞态。',
      tags: ['MongoDB', '工程化'],
    })
  })

  it('摘要是空字符串时整个结果作废（宁可没有，也不要空摘要）', () => {
    expect(sanitizePostMeta({ summary: '', tags: ['Vue'] })).toBeNull()
  })

  it('摘要只有空白字符时同样作废', () => {
    expect(sanitizePostMeta({ summary: '   \n  ', tags: ['Vue'] })).toBeNull()
  })

  it('摘要超长时截断，并保证长度不超过契约上限', () => {
    const result = sanitizePostMeta({
      summary: '很长的摘要。'.repeat(100),
      tags: ['Vue'],
    })

    expect(result).not.toBeNull()
    expect(result!.summary.length).toBeLessThanOrEqual(AI_SUMMARY_MAX_LENGTH)
    // 末尾要有省略号，让读者知道内容被截断了
    expect(result!.summary.endsWith('…')).toBe(true)
  })

  it('过滤掉不在白名单里的标签（模型很爱自己造标签）', () => {
    const result = sanitizePostMeta({
      summary: '正常摘要',
      // 'Vue3' 与 'React' 都不在白名单里
      tags: ['Vue', 'Vue3', 'React', 'TypeScript'],
    })

    expect(result!.tags).toEqual(['Vue', 'TypeScript'])
  })

  it('标签全部非法时整个结果作废（避免出现"只有摘要没有标签"的半成品）', () => {
    expect(sanitizePostMeta({ summary: '正常摘要', tags: ['Vue3', 'React'] })).toBeNull()
  })

  it('标签去重', () => {
    const result = sanitizePostMeta({
      summary: '正常摘要',
      tags: ['Vue', 'Vue', 'Nuxt'],
    })

    expect(result!.tags).toEqual(['Vue', 'Nuxt'])
  })

  it('标签数量超过上限时截断', () => {
    const result = sanitizePostMeta({
      summary: '正常摘要',
      tags: ['JavaScript', 'TypeScript', 'Vue', 'Nuxt', 'NestJS', 'MongoDB', 'LangChain'],
    })

    expect(result!.tags).toHaveLength(MAX_TAGS_PER_POST)
  })

  it('标签前后的空格被去掉（模型经常多打一个空格）', () => {
    const result = sanitizePostMeta({
      summary: '正常摘要',
      tags: ['  Vue  ', 'Nuxt'],
    })

    expect(result!.tags).toEqual(['Vue', 'Nuxt'])
  })
})

describe('describeError', () => {
  it('保留错误名与信息，方便定位', () => {
    expect(describeError(new TypeError('请求超时'))).toBe('TypeError: 请求超时')
  })

  it('超长错误被截断（防止把整个响应体写进日志）', () => {
    const long = new Error('x'.repeat(500))
    const described = describeError(long)

    expect(described.length).toBeLessThanOrEqual(161)
    expect(described.endsWith('…')).toBe(true)
  })

  it('非 Error 对象也能安全转换', () => {
    expect(describeError('字符串错误')).toBe('字符串错误')
  })
})

describe('redactApiKey', () => {
  it('把日志里出现的密钥替换成 ***', () => {
    const key = 'abc123.def456'
    const text = `请求头 Authorization: Bearer ${key} 被拒绝`

    const redacted = redactApiKey(text, key)

    expect(redacted).not.toContain(key)
    expect(redacted).toContain('***')
  })

  it('没有配置密钥时原样返回', () => {
    expect(redactApiKey('普通日志', null)).toBe('普通日志')
  })
})
