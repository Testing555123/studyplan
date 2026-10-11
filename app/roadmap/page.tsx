import type { Metadata } from 'next'
import { BookOpen, ExternalLink, Map } from 'lucide-react'
import Link from 'next/link'
import { SiteNav } from '@/components/site/site-nav'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * 全栈学习路线页：iframe 嵌入 roadmap.sh 官方路线图（路线页 URL + ?embed 为官方嵌入格式）。
 * 纯内容页，不依赖会话/DB，可静态渲染。
 */

// roadmap.sh 官方提供的嵌入地址（full-stack 路线 + ?embed）。
const ROADMAP_EMBED_URL = 'https://roadmap.sh/full-stack?embed'
const ROADMAP_HOME_URL = 'https://roadmap.sh/full-stack'

export const metadata: Metadata = {
  title: '全栈学习路线 · StudyPlan',
  description: '从基础到上线的全栈学习路线图，与本站电子书各阶段对照学习。',
}

export default function RoadmapPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteNav session={null} />

      <main className="mx-auto max-w-6xl px-4 py-10">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-card bg-primary/10 text-primary">
              <Map className="size-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">全栈学习路线</h1>
              <p className="text-sm text-muted-foreground">
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

        <Card className="overflow-hidden border-border/60 bg-card/60 p-0 backdrop-blur">
          <CardHeader className="border-b border-border/60 py-4">
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
