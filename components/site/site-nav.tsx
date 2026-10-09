'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { authClient } from '@/lib/auth/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export interface NavSessionUser {
  name: string
  email: string
  image?: string | null
}

/**
 * 站点导航（T9）。logo + 电子书入口 + 主题切换 + 登录/会话。
 * 登录使用 better-auth 客户端（authClient.signIn.email）；会话态显示头像与登出。
 */
export function SiteNav({ session }: { session: { user: NavSessionUser } | null }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => setMounted(true), [])

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setPending(true)
    const res = await authClient.signIn.email({ email, password })
    setPending(false)
    if (res.error) {
      setError(res.error.message ?? '登录失败，请检查邮箱与密码')
      return
    }
    setOpen(false)
    window.location.reload()
  }

  async function logout() {
    await authClient.signOut()
    window.location.reload()
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
            <span>📚</span>
            <span>StudyPlan</span>
          </Link>
          <nav className="hidden items-center gap-4 text-sm text-muted-foreground sm:flex">
            <Link href="/ebook" className="transition-colors hover:text-foreground">
              电子书
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="切换主题"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            {mounted && resolvedTheme === 'dark' ? '☀️' : '🌙'}
          </Button>

          {session ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                {session.user.image ? (
                  <AvatarImage src={session.user.image} alt={session.user.name} />
                ) : null}
                <AvatarFallback>{session.user.name.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
              <Button variant="ghost" size="sm" onClick={logout}>
                退出
              </Button>
            </div>
          ) : (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button size="sm">登录</Button>} />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>登录 StudyPlan</DialogTitle>
                  <DialogDescription>使用邮箱与密码登录。</DialogDescription>
                </DialogHeader>
                <form onSubmit={login} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="email">
                      邮箱
                    </label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="password">
                      密码
                    </label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className={cn('w-full')} disabled={pending}>
                    {pending ? '登录中…' : '登录'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
    </header>
  )
}
