import Link from 'next/link'
import { source } from '@/lib/source'
import { resolveEbookTitle } from '@/lib/ebook-title'
import { getSession } from '@/lib/auth/session'
import { SiteNav } from '@/components/site/site-nav'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

// 首页依赖会话（getSession），不可静态预渲染：强制动态，避免构建期触达数据库。
export const dynamic = 'force-dynamic'

const FEATURES = [
  {
    icon: '🧭',
    title: '结构化学习路线',
    desc: 'roadmap.sh 官方全栈路线图内嵌展示，配合本站 8 阶段电子书逐个击破。',
  },
  {
    icon: '✍️',
    title: '技术分享与沉淀',
    desc: '把踩过的坑与最佳实践写成电子书章节，社区共同维护、持续更新。',
  },
  {
    icon: '🔍',
    title: '⌘K 全站搜索',
    desc: '按 ⌘/Ctrl+K 唤起命令面板：页面直达 + 电子书内容语义检索。',
  },
  {
    icon: '🔥',
    title: 'GitHub 热门',
    desc: '每日更新的高分新项目，附模板导读与相关课程阶段标注。',
  },
]

export default async function Home() {
  const session = await getSession()

  const entries = source
    .getPages()
    .filter((p) => (p.slugs?.length ?? 0) > 0)
    .map((p) => ({
      url: p.url,
      title: resolveEbookTitle(p.data.title, p.data.structuredData, p.slugs),
    }))
    .filter((e, i, arr) => arr.findIndex((x) => x.url === e.url) === i)
    .slice(0, 9)

  return (
    <div className="min-h-screen bg-background">
      <SiteNav
        session={
          session?.user
            ? {
                user: {
                  name: session.user.name,
                  email: session.user.email,
                  image: session.user.image,
                },
              }
            : null
        }
      />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-indigo-500/10 via-transparent to-fuchsia-500/10" />
          <div
            className="absolute -top-32 left-1/2 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
            aria-hidden
          />
          <div className="mx-auto max-w-6xl px-4 py-24 text-center md:py-32">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur">
              📚 学习路线 · 技术分享 · 全文搜索
            </span>
            <h1 className="mt-6 text-4xl font-bold tracking-tight md:text-6xl">
              把<span className="bg-gradient-to-r from-indigo-500 to-fuchsia-500 bg-clip-text text-transparent">学习</span>
              变成可执行的路线
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              StudyPlan 是一个面向开发者的学习社区：结构化的电子书、清晰的学习阶段，以及覆盖工程地基到上线的完整实践指引。
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Button size="lg" render={<Link href="/ebook" />}>
                开始学习
              </Button>
              <Button size="lg" variant="outline" render={<Link href="/ebook" />}>
                浏览电子书
              </Button>
            </div>
          </div>
        </section>

        {/* 特性卡片 */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <Card
                key={f.title}
                className="border-border/60 bg-card/60 backdrop-blur transition-transform duration-200 hover:-translate-y-1"
              >
                <CardHeader>
                  <div className="text-3xl">{f.icon}</div>
                  <CardTitle className="mt-2">{f.title}</CardTitle>
                  <CardDescription>{f.desc}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        {/* 电子书入口 */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="mb-8 flex items-end justify-between">
            <h2 className="text-2xl font-bold">精选电子书章节</h2>
            <Link
              href="/ebook"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              查看全部 →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((e) => (
              <Link key={e.url} href={e.url} className="group">
                <Card className="h-full border-border/60 bg-card/60 backdrop-blur transition-colors duration-200 group-hover:border-primary/50">
                  <CardContent className="p-5">
                    <p className="font-medium text-foreground group-hover:text-primary">
                      {e.title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">阅读章节 →</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-10 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} StudyPlan · 用 ❤️ 构建
      </footer>
    </div>
  )
}
