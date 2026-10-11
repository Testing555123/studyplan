import type { Metadata } from 'next'
import { Flame, Sparkles, KeyRound, RefreshCw } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { SiteNav } from '@/components/site/site-nav'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RepoList } from '@/components/trending/repo-list'
import { getTrendingCached } from '@/lib/github/trending'
import { buildDigestFromSnapshot } from '@/lib/digest/build'

// 依赖会话与 DB 读路径（懒刷新），不可静态预渲染。
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'GitHub 热门 · StudyPlan',
  description: '每日更新的 GitHub 高分新项目，附中文导读与相关课程标注。',
}

export default async function TrendingPage() {
  const session = await getSession()
  const snapshot = await getTrendingCached()
  const digest = buildDigestFromSnapshot(snapshot.repos)

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

      <main className="mx-auto max-w-4xl px-4 py-10">
        <header className="mb-8 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-card bg-primary/10 text-primary">
            <Flame className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">GitHub 热门</h1>
            <p className="text-sm text-muted-foreground">每天更新的高分新项目，附相关课程标注</p>
          </div>
        </header>

        {!snapshot.configured ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <KeyRound className="size-8 text-muted-foreground" />
              <p className="font-medium">尚未配置 GITHUB_TOKEN</p>
              <p className="max-w-md text-sm text-muted-foreground">
                在环境变量中配置 GitHub Personal Access Token 后，这里会展示每日 star 增长最快的新项目。
              </p>
            </CardContent>
          </Card>
        ) : snapshot.repos.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <RefreshCw className="size-8 text-muted-foreground" />
              <p className="font-medium">今日快照暂未生成</p>
              <p className="max-w-md text-sm text-muted-foreground">
                数据在当日首次访问时后台拉取，若上游接口暂时不可用请稍后刷新重试。
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* 每日精选导读卡 */}
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-card/60 to-card/60 backdrop-blur">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="size-4 text-primary" />
                    每日精选
                  </CardTitle>
                  {snapshot.fetchedAt ? (
                    <Badge variant="ghost">
                      更新于 {snapshot.fetchedAt.toISOString().slice(11, 16)} UTC
                    </Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-foreground/90">{digest.text}</p>
              </CardContent>
            </Card>

            {/* 仓库列表 */}
            <section className="mt-6">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                收录项目（{digest.count}）
              </h2>
              <RepoList repos={snapshot.repos} />
            </section>
          </>
        )}
      </main>
    </div>
  )
}
