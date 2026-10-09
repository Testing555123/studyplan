import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { source } from '@/lib/source'
import { resolveEbookTitle } from '@/lib/ebook-title'
import { EbookCommentsSlot } from '@/components/comments/giscus'
import { EbookToc } from '@/components/ebook/toc'

interface Heading {
  id: string
  content: string
}

export function generateStaticParams() {
  return source.generateParams()
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}): Promise<Metadata> {
  const { slug } = await params
  const page = source.getPage(slug)
  if (!page) return {}
  const title = resolveEbookTitle(page.data.title, page.data.structuredData, page.slugs)
  return {
    title: `${title} · StudyPlan 电子书`,
    description: page.data.description,
  }
}

export default async function EbookPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  const page = source.getPage(slug)
  if (!page) notFound()

  const title = resolveEbookTitle(page.data.title, page.data.structuredData, page.slugs)
  const Body = page.data.body
  const headings = (page.data.structuredData?.headings ?? []) as Heading[]

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_220px]">
      <article className="ebook-prose min-w-0">
        <h1 className="mb-6 text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
        <Body />
        <div className="mt-16 border-t border-border pt-8">
          <EbookCommentsSlot slug={page.slugs.join('/')} />
        </div>
      </article>
      <aside className="hidden lg:block">
        <div className="sticky top-24">
          <EbookToc headings={headings} />
        </div>
      </aside>
    </div>
  )
}
