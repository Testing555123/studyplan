import type { Metadata } from 'next'
import { BookOpen, ExternalLink, Map } from 'lucide-react'
import Link from 'next/link'
import { SiteNav } from '@/components/site/site-nav'
import { Button } from '@/components/m3e/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/m3e/card'

/**
 * 全栈学习路线页：iframe 嵌入官方 roadmap.sh 交互式路线图。
 *
 * 直连官方站会被其 `X-Frame-Options: SAMEORIGIN` 拦截（实测无任何可用嵌入端点），
 * 故 iframe 指向本站同源代理 /proxy/roadmap/*：由服务端抓取官方页面、剥离 frame
 * 限制头后返回，官方交互式路线图即可在本站内渲染。纯内容页，不依赖会话/DB。
 */

// 本站同源代理地址：iframe 文档路径必须与官方路径同构（/full-stack），官方
// React Router 才能按 location.pathname 匹配路由。服务端转发详见 app/full-stack。
const ROADMAP_EMBED_URL = '/full-stack?embed=true'
// 官方在线版入口（外链按钮 + 出处标识）。
const ROADMAP_HOME_URL = 'https://roadmap.sh/full-stack'

export const metadata: Metadata = {
  title: '全栈学习路线 · StudyPlan',
  description: '从基础到上线的全栈学习路线图，与本站电子书各阶段对照学习。',
}

export default function RoadmapPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteNav session={null} />

      <main id="main-content" className="mx-auto max-w-6xl px-4 py-10">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-card bg-secondary-container text-on-secondary-container">
              <Map className="size-5" />
            </span>
            <div>
              <h1 className="text-headline-small font-medium">全栈学习路线</h1>
              <p className="text-body-medium text-on-surface-variant">
                官方路线图（roadmap.sh）× 本站电子书 8 阶段实战，从基础到上线
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" render={<Link href="/ebook" />}>
              <BookOpen className="size-4" />
              配套电子书
            </Button>
            <Button variant="ghost" render={<a href={ROADMAP_HOME_URL} target="_blank" rel="noopener noreferrer" />}>
              <ExternalLink className="size-4" />
              在 roadmap.sh 打开
            </Button>
          </div>
        </header>

        <Card variant="filled" className="overflow-hidden rounded-lg p-0">
          <CardHeader className="border-b border-border py-4">
            <CardTitle className="text-base">Full Stack Roadmap</CardTitle>
            <CardDescription>
              蓝色节点为推荐学习顺序。可结合本站电子书的阶段章节逐个击破，节点内容在 roadmap.sh 上持续更新。
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <iframe
              src={ROADMAP_EMBED_URL}
              title="roadmap.sh 全栈学习路线图"
              loading="lazy"
              className="h-[720px] w-full border-0"
            />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
