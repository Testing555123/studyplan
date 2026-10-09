import type { FC } from 'react'

/**
 * 电子书评论插槽（T4 占位 / T14 实现）。
 * T14 将在此挂载 Giscus；当前返回 null，不渲染任何内容以保持 SSR 干净、不引入外部脚本。
 * slug 为页面路径（如 "design/01-visual-style-analysis"），供 T14 定位评论线程。
 */
export const EbookCommentsSlot: FC<{ slug: string }> = () => {
  return null
}
