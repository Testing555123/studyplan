import { defineCollection, defineContentConfig, z } from '@nuxt/content'

/**
 * P19 沙盒的 content collection。
 *
 * 关键约束：
 *  - 全部内容挂在 /ebook 前缀（VitePress 时代线上是 base=/ebook/）
 *  - 30 篇正文都没有 frontmatter（实测：除 index.md 外均无 `---` 块），
 *    标题来自正文首个 `#` 标题，因此 schema 里 title 必须是可选
 *  - index.md 有 VitePress 专属 frontmatter（layout: home / hero），
 *    迁移时不能照搬；本沙盒把它排除在 page 集合外单独处理
 *
 * 踩坑记录：块注释内不能出现「星号 + 星号 + 斜杠」这个连续序列，
 *      它会提前闭合块注释，导致后面内容被当代码解析。
 *      本次构建连踩两次，且报错信息（Unexpected character / Unterminated template）
 *      完全不指向真正的原因，排查成本很高。
 */
export default defineContentConfig({
  collections: {
    docs: defineCollection({
      type: 'page',
      source: {
        include: '**/*.md',
        exclude: ['index.md'],
        prefix: '/ebook',
      },
      schema: z.object({
        // 绝大多数文档没有 frontmatter，标题由正文首个 h1 决定
        title: z.string().optional(),
        description: z.string().optional(),
      }),
    }),
  },
})
