import { ExternalLink, Star, GitFork, GraduationCap } from 'lucide-react'
import { Badge } from '@/components/m3e/badge'
import { Card, CardContent } from '@/components/m3e/card'
import { cn } from '@/lib/utils'
import type { TrendingRepo } from '@/lib/db/schema/github'

function formatStars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

export function RepoRow({ repo }: { repo: TrendingRepo }) {
  return (
    <Card
      className={cn(
        'rounded-lg transition-colors hover:bg-surface-container-high',
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
            <p className="flex items-center gap-1.5 font-medium text-on-surface transition-colors group-hover/min0:text-primary">
              <span className="truncate">{repo.fullName}</span>
              <ExternalLink className="size-3.5 shrink-0 text-on-surface-variant transition-colors group-hover/min0:text-primary" />
            </p>
            {repo.description ? (
              <p className="mt-1 line-clamp-2 text-body-medium text-on-surface-variant">{repo.description}</p>
            ) : null}
          </a>
          <div className="flex shrink-0 items-center gap-1.5">
            {repo.language ? (
              <Badge variant="secondary">{repo.language}</Badge>
            ) : null}
            <Badge variant="outline">
              <Star className="size-3 text-warning" />
              {formatStars(repo.stargazersCount)}
            </Badge>
            <Badge variant="outline" className="hidden sm:inline-flex">
              <GitFork className="size-3 text-on-surface-variant" />
              {formatStars(repo.forksCount)}
            </Badge>
          </div>
        </div>
        {repo.relatedStageSlug ? (
          <a
            href={`/ebook/${repo.relatedStageSlug}`}
            className="mt-2 inline-flex items-center gap-1 text-label-small font-medium text-primary underline-offset-4 hover:underline"
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
