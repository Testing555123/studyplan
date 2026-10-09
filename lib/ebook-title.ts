import type { StructuredData } from 'fumadocs-core/mdx-plugins'

/**
 * 电子书标题兜底。
 *
 * v2.0 的 29 篇正文没有 frontmatter，标题只能从正文首个标题取。
 * Fumadocs 的 `structuredData.headings` 是 `{ id, content }`（没有 depth 字段），
 * 首个元素即文档主标题。若连标题都没有，退回从 slug 生成可读标题，避免空白标题。
 */
export function resolveEbookTitle(
  frontmatterTitle: string | undefined,
  structuredData: StructuredData | undefined,
  fallbackSlug: string[],
): string {
  if (frontmatterTitle && frontmatterTitle.trim()) return frontmatterTitle.trim()

  const firstHeading = structuredData?.headings?.[0]
  if (firstHeading?.content?.trim()) return firstHeading.content.trim()

  const last = fallbackSlug[fallbackSlug.length - 1] ?? '未命名'
  return last.replace(/[-_]/g, ' ').replace(/^\d+\s*/, '')
}
