/**
 * 电子书 Markdown 分块（T10）。
 * 策略：按标题边界优先切分，超长段落再按字符滑窗切；相邻块保留重叠避免语义断裂。
 * 纯函数，便于单测与 backfill 脚本共用。
 */
export interface RawChunk {
  chunkIndex: number
  content: string
}

export const DEFAULT_CHUNK_CHARS = 1200
export const DEFAULT_CHUNK_OVERLAP = 120

/** 去掉 frontmatter（content/ebook 部分文件可能后续补 frontmatter）。 */
export function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---')) return markdown
  const end = markdown.indexOf('\n---', 3)
  if (end === -1) return markdown
  return markdown.slice(end + 4).trim()
}

/** 按一级/二级标题切成小节，再对超长小节滑窗。 */
export function chunkMarkdown(
  markdown: string,
  maxChars = DEFAULT_CHUNK_CHARS,
  overlap = DEFAULT_CHUNK_OVERLAP,
): RawChunk[] {
  const text = stripFrontmatter(markdown).trim()
  if (!text) return []

  const sections = text.split(/\n(?=#{1,3}\s)/).filter((s) => s.trim().length > 0)
  const chunks: string[] = []

  for (const section of sections) {
    if (section.length <= maxChars) {
      chunks.push(section.trim())
      continue
    }
    let start = 0
    while (start < section.length) {
      const end = Math.min(start + maxChars, section.length)
      chunks.push(section.slice(start, end).trim())
      if (end >= section.length) break
      start = end - overlap
    }
  }

  return chunks
    .filter((c) => c.length > 0)
    .map((content, chunkIndex) => ({ chunkIndex, content }))
}
