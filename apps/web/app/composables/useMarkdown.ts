import MarkdownIt from 'markdown-it'

/**
 * Markdown 渲染。
 *
 * 为什么单独抽成 composable 而不是在详情页里直接 new 一个？
 *   因为 markdown-it 实例的创建是有成本的（要构建解析规则表）。
 *   放在 composable 顶层作用域，**整个应用只创建一次**，所有页面共用。
 *
 * 安全设计（重要）：
 *   这里显式把 `html` 关掉。markdown-it 默认 `html: false`，
 *   意味着正文里写的原生 HTML 标签会被**转义成文本**而不是执行。
 *   帖子正文是用户输入的内容，一旦允许它注入 HTML，
 *   就等于把 XSS 漏洞直接送给每一个读帖的人。
 *
 *   将来如果要支持 HTML（比如嵌入视频），必须加一层白名单清洗
 *   （如 DOMPurify），而不是简单地把 html 改成 true。
 */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
})

export function useMarkdown() {
  /** 把 Markdown 原文渲染成 HTML 字符串 */
  function render(markdown: string): string {
    return md.render(markdown)
  }

  /**
   * 从正文里抽出纯文本，用于生成"阅读时长"这类衍生信息。
   * 中英文混排时按"中文按字、英文按词"粗估，够用即可。
   */
  function readingMinutes(markdown: string): number {
    const plain = markdown
      .replace(/```[\s\S]*?```/g, '')
      .replace(/[#>*`\-_[\]()]/g, '')
      .trim()

    const chineseChars = (plain.match(/[\u4e00-\u9fa5]/g) ?? []).length
    const englishWords = (plain.match(/[a-zA-Z]+/g) ?? []).length
    // 中文约 400 字/分钟，英文约 200 词/分钟
    const minutes = chineseChars / 400 + englishWords / 200

    return Math.max(1, Math.round(minutes))
  }

  return { render, readingMinutes }
}
