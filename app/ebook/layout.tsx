import { source } from '@/lib/source'
import { resolveEbookTitle } from '@/lib/ebook-title'
import { EbookShell, type EbookNavItem } from '@/components/ebook/shell'
import './ebook.css'

export default function EbookLayout({ children }: { children: React.ReactNode }) {
  const pages: EbookNavItem[] = source.getPages().map((p) => ({
    url: p.url,
    title: resolveEbookTitle(p.data.title, p.data.structuredData, p.slugs),
    group: p.slugs[0] ?? 'home',
  }))

  return <EbookShell pages={pages}>{children}</EbookShell>
}
