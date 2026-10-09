import { z } from 'zod'
import { defineDocs, frontmatterSchema } from 'fumadocs-mdx/config'

// 电子书内容源。dir 指向复制自 v2.0 的 30 篇 Markdown。
//
// ⚠️ 标题为什么放宽为 optional：v2.0 的 29 篇正文**根本没有 frontmatter**，
// 标题取自正文首个 `#`（只有根目录 index.md 有 VitePress 风格的 layout/hero）。
// 因此这里放宽 schema，标题由 lib/ebook-title.ts 从 structuredData 的 h1 兜底。
export const { docs } = defineDocs({
  dir: 'content/ebook',
  docs: {
    schema: frontmatterSchema.extend({
      title: z.string().optional(),
      description: z.string().optional(),
    }),
  },
})
