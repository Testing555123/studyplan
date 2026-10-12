'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BookOpen,
  Flame,
  Home,
  Map,
  Sparkles,
  CornerDownLeft,
} from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/m3e/command'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/m3e/dialog'
import { Skeleton } from '@/components/m3e/skeleton'
import type { SearchHit } from '@/lib/search/semantic'

/**
 * ⌘K 全站搜索命令面板（本批功能）。
 * - "页面"分组：固定导航命令。
 * - "电子书"分组：输入 ≥2 字符后防抖 300ms 调 /api/search 语义检索；未配置 AI 时该分组不出现。
 * - 打开方式：⌘/Ctrl+K，或 site-nav 搜索按钮派发的自定义事件。
 */
const OPEN_EVENT = 'studyplan:open-command-palette'

const NAV_ITEMS = [
  { label: '首页', hint: '学习概览', href: '/', icon: Home },
  { label: '学习路线', hint: 'roadmap.sh 路线图', href: '/roadmap', icon: Map },
  { label: 'GitHub 热门', hint: '每日精选项目', href: '/trending', icon: Flame },
  { label: '电子书', hint: '8 阶段全栈实战', href: '/ebook', icon: BookOpen },
  { label: 'AI 助手', hint: '站内资料问答', href: '/ai', icon: Sparkles },
] as const

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const seqRef = useRef(0)

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    function onOpen() {
      setOpen(true)
    }
    window.addEventListener('keydown', onKeydown)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKeydown)
      window.removeEventListener(OPEN_EVENT, onOpen)
    }
  }, [])

  const reset = useCallback(() => {
    setQuery('')
    setHits([])
    setLoading(false)
  }, [])

  // 语义检索：≥2 字符防抖请求；竞态用序号丢弃过期响应。
  // 所有 setState 都发生在异步回调内（effect 体内同步 setState 会触发级联渲染）。
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) return

    const seq = ++seqRef.current
    const timer = setTimeout(() => {
      setLoading(true)
      void (async () => {
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`)
          if (!res.ok) throw new Error(String(res.status))
          const body = (await res.json()) as { data?: { hits?: SearchHit[] } }
          if (seq !== seqRef.current) return
          setHits(body.data?.hits ?? [])
        } catch {
          if (seq === seqRef.current) setHits([])
        } finally {
          if (seq === seqRef.current) setLoading(false)
        }
      })()
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  function go(href: string) {
    setOpen(false)
    reset()
    router.push(href)
  }

  function onSelect(href: string) {
    return () => go(href)
  }

  const showSemanticGroup = query.trim().length >= 2

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
        <DialogTitle className="sr-only">全站搜索</DialogTitle>
        <DialogDescription className="sr-only">搜索页面与电子书内容</DialogDescription>
        <Command shouldFilter={false} className="rounded-card">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="搜索页面，或输入关键词检索电子书…"
          />
          <CommandList>
            {showSemanticGroup ? (
              loading ? (
                <div className="space-y-2 p-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : hits.length > 0 ? (
                <CommandGroup heading="电子书">
                  {hits.map((hit) => (
                    <CommandItem key={hit.url} value={`ebook:${hit.url}`} onSelect={onSelect(hit.url)}>
                      <BookOpen className="size-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{hit.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{hit.snippet}</span>
                      </span>
                      <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : (
                <CommandEmpty>电子书中没有匹配的内容</CommandEmpty>
              )
            ) : null}

            <CommandGroup heading="页面">
              {NAV_ITEMS.map((item) => (
                <CommandItem key={item.href} value={`nav:${item.href}`} onSelect={onSelect(item.href)}>
                  <item.icon className="size-4 shrink-0 text-primary" />
                  <span className="flex-1">{item.label}</span>
                  <CommandShortcut>{item.hint}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <div className="flex items-center gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground">
            <span>↑↓ 选择</span>
            <span>↵ 跳转</span>
            <span>esc 关闭</span>
            <span className="ml-auto">⌘K 随时唤起</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

/** 供 site-nav 搜索按钮调用：打开命令面板。 */
export function openCommandPalette(): void {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT))
}
