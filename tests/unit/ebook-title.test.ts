import { describe, expect, it } from 'vitest'
import { resolveEbookTitle } from '@/lib/ebook-title'

// v2.0 的 29 篇正文没有 frontmatter，标题必须能从正文首个标题兜底（SPEC §13）。
describe('resolveEbookTitle', () => {
  it('frontmatter 有标题时直接使用', () => {
    expect(
      resolveEbookTitle('阶段 1 · 工程地基', { headings: [], contents: [] }, ['stages', 'stage-1']),
    ).toBe('阶段 1 · 工程地基')
  })

  it('frontmatter 空白时取正文首个标题（v2.0 无 frontmatter 的主路径）', () => {
    expect(
      resolveEbookTitle(
        undefined,
        { headings: [{ id: 'h1', content: '阶段 1 · 工程地基与 TypeScript 起步' }, { id: 'h2', content: '小节' }], contents: [] },
        ['stages', 'stage-1'],
      ),
    ).toBe('阶段 1 · 工程地基与 TypeScript 起步')
  })

  it('正文也没有标题时退回 slug 生成可读标题', () => {
    expect(resolveEbookTitle(undefined, undefined, ['guide', '01-roadmap'])).toBe('roadmap')
  })

  it('slug 也没有时给出兜底标题', () => {
    expect(resolveEbookTitle(undefined, undefined, [])).toBe('未命名')
  })
})
