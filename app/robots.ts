import type { MetadataRoute } from 'next'

// 空串兜底同 app/layout.tsx：避免 new URL('') 构建期崩溃。
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/api/',
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
