interface Heading {
  id: string
  content: string
}

/** 本页目录（T4）：基于 Fumadocs structuredData.headings 的锚点跳转。 */
export function EbookToc({ headings }: { headings: Heading[] }) {
  const items = headings.filter((h) => h.id && h.content)
  if (items.length === 0) return null

  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        本页目录
      </p>
      <ul className="space-y-2 text-sm">
        {items.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {h.content}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
