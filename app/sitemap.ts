import type { MetadataRoute } from 'next'
import { source } from '@/lib/source'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  const ebookPages = source.getPages().map((p) => ({
    url: `${siteUrl}${p.url}`,
    lastModified: new Date(),
  }))

  return [{ url: siteUrl, lastModified: new Date() }, ...ebookPages]
}
