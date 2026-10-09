import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'StudyPlan · 学习路线与电子书社区',
    template: '%s · StudyPlan',
  },
  description:
    'StudyPlan 是面向学习路线规划与技术分享的社区，提供结构化的电子书与全文搜索。',
  keywords: ['学习路线', '技术分享', '电子书', 'StudyPlan', '编程学习'],
  authors: [{ name: 'StudyPlan' }],
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    title: 'StudyPlan · 学习路线与电子书社区',
    description: '结构化的学习路线、技术分享与全文搜索电子书。',
    siteName: 'StudyPlan',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'StudyPlan',
    description: '学习路线与电子书社区。',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
