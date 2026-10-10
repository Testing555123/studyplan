'use client'

import { useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'

/**
 * Giscus 评论（T14 / SPEC §12.5）。
 *
 * - 数据留在 GitHub Discussions，**不进自有 PG**（D16）。
 * - `data-mapping="pathname"`：每篇章节自动对应一个 thread。
 * - 主题跟随站点明暗（next-themes），切换时重建 iframe。
 * - 未配置 NEXT_PUBLIC_GISCUS_* 时静默不渲染（V5：未配不阻断）。
 * - 用原生 <script> 注入，不引入 @giscus/react（少一个依赖，也避免 SSR 期加载外链）。
 */
const GISCUS_SRC = 'https://giscus.app/client.js'

interface GiscusConfig {
  repo: string
  repoId: string
  category: string
  categoryId: string
}

function readConfig(): GiscusConfig | null {
  const repo = process.env.NEXT_PUBLIC_GISCUS_REPO
  const repoId = process.env.NEXT_PUBLIC_GISCUS_REPO_ID
  const category = process.env.NEXT_PUBLIC_GISCUS_CATEGORY
  const categoryId = process.env.NEXT_PUBLIC_GISCUS_CATEGORY_ID
  if (!repo || !repoId || !category || !categoryId) return null
  return { repo, repoId, category, categoryId }
}

export function EbookCommentsSlot({ slug }: { slug: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { resolvedTheme } = useTheme()
  const config = readConfig()
  const theme = resolvedTheme === 'dark' ? 'dark' : 'light'

  useEffect(() => {
    const container = containerRef.current
    if (!container || !config) return

    container.textContent = ''
    const script = document.createElement('script')
    script.src = GISCUS_SRC
    script.async = true
    script.setAttribute('data-repo', config.repo)
    script.setAttribute('data-repo-id', config.repoId)
    script.setAttribute('data-category', config.category)
    script.setAttribute('data-category-id', config.categoryId)
    script.setAttribute('data-mapping', 'pathname')
    script.setAttribute('data-strict', '0')
    script.setAttribute('data-reactions-enabled', '1')
    script.setAttribute('data-emit-metadata', '0')
    script.setAttribute('data-input-position', 'bottom')
    script.setAttribute('data-theme', theme)
    script.setAttribute('data-lang', 'zh-CN')
    script.setAttribute('data-loading', 'lazy')
    container.appendChild(script)

    return () => {
      container.textContent = ''
    }
  }, [config?.repo, config?.categoryId, theme, slug])

  if (!config) return null

  return (
    <section
      ref={containerRef}
      data-ebook-comments={slug}
      aria-label="章节评论"
      className="mt-12 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
    />
  )
}
