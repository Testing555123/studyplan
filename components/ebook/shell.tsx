'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface EbookNavItem {
  url: string
  title: string
  group: string
}

const GROUP_LABELS: Record<string, string> = {
  home: '总览',
  stages: '阶段路线',
  design: '设计',
  guide: '指南',
  exercises: '练习',
}

const GROUP_ORDER = ['home', 'stages', 'design', 'guide', 'exercises']

function NavList({
  pages,
  pathname,
  onNavigate,
}: {
  pages: EbookNavItem[]
  pathname: string
  onNavigate?: () => void
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, EbookNavItem[]>()
    for (const p of pages) {
      const g = p.group || 'home'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(p)
    }
    return [...map.entries()].sort(
      (a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]),
    )
  }, [pages])

  return (
    <nav className="space-y-5">
      {grouped.map(([group, items]) => (
        <div key={group}>
          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {GROUP_LABELS[group] ?? group}
          </p>
          <ul className="mt-2 space-y-1">
            {items.map((item) => {
              const active = pathname === item.url
              return (
                <li key={item.url}>
                  <Link
                    href={item.url}
                    onClick={onNavigate}
                    className={cn(
                      'block rounded-lg px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-foreground/80 hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {item.title}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function SearchModal({
  open,
  onClose,
  pages,
}: {
  open: boolean
  onClose: () => void
  pages: EbookNavItem[]
}) {
  const [q, setQ] = useState('')
  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return pages
    return pages.filter((p) => p.title.toLowerCase().includes(query))
  }, [q, pages])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border p-3">
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索电子书章节…"
            className="border-0 bg-transparent text-base focus-visible:ring-0"
          />
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              没有匹配的章节
            </li>
          ) : (
            results.map((r) => (
              <li key={r.url}>
                <Link
                  href={r.url}
                  onClick={onClose}
                  className="block rounded-lg px-3 py-2 text-sm text-foreground/90 transition-colors hover:bg-muted"
                >
                  {r.title}
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}

export function EbookShell({
  pages,
  children,
}: {
  pages: EbookNavItem[]
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="打开目录"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-foreground/80 transition-colors hover:bg-muted lg:hidden"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            <Link href="/ebook" className="flex items-center gap-2 font-semibold">
              <span className="text-lg">📚</span>
              <span>StudyPlan 电子书</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="搜索"
              onClick={() => setSearchOpen(true)}
              className="rounded-lg p-2 text-foreground/80 transition-colors hover:bg-muted"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="切换主题"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            >
              {resolvedTheme === 'dark' ? '☀️' : '🌙'}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-4">
        <aside className="hidden w-64 shrink-0 py-8 lg:block">
          <div className="sticky top-24">
            <NavList pages={pages} pathname={pathname} />
          </div>
        </aside>
        <main className="min-w-0 flex-1 py-8">{children}</main>
      </div>

      {/* 移动端抽屉 */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 flex lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div className="w-72 overflow-y-auto border-r border-border bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <span className="font-semibold">目录</span>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
              >
                ✕
              </button>
            </div>
            <NavList pages={pages} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} pages={pages} />
    </div>
  )
}
