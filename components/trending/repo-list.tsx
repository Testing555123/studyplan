import { ExternalLink, Star, GitFork, GraduationCap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { TrendingRepo } from '@/lib/db/schema/github'

function formatStars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

export function RepoRow({ repo }: { repo: TrendingRepo }) {
  return (
    <Card
      className={cn(
        'border-border/60 bg-card/60 backdrop-blur transition-all duration-300',
        'hover:-translate-y-0.5 hover:border-primary/40',
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <a
            href={repo.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group/min0 min-w-0 flex-1"
          >
            <p className="flex items-center gap-1.5 font-semibold text-foreground transition-colors group-hover/min0:text-primary">
              <span className="truncate">{repo.fullName}</span>
              <ExternalLink className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover/min0:-translate-y-0.5 group-hover/min0:translate-x-0.5" />
            </p>
            {repo.description ? (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{repo.description}</p>
            ) : null}
          </a>
          <div className="flex shrink-0 items-center gap-1.5">
            {repo.language ? (
              <Badge variant="secondary">{repo.language}</Badge>
            ) : null}
            <Badge variant="outline">
              <Star className="size-3 text-amber-500" />
              {formatStars(repo.stargazersCount)}
            </Badge>
            <Badge variant="outline" className="hidden sm:inline-flex">
              <GitFork className="size-3 text-muted-foreground" />
              {formatStars(repo.forksCount)}
            </Badge>
          </div>
        </div>
        {repo.relatedStageSlug ? (
          <a
            href={`/ebook/${repo.relatedStageSlug}`}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            <GraduationCap className="size-3.5" />
            相关课程：{repo.relatedStageTitle ?? repo.relatedStageSlug}
          </a>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function RepoList({ repos }: { repos: TrendingRepo[] }) {
  return (
    <div className="space-y-3">
      {repos.map((repo) => (
        <RepoRow key={repo.fullName} repo={repo} />
      ))}
    </div>
  )
}
