import { avatarInitial as sharedAvatarInitial } from '@studyplan/shared'

/**
 * 展示层的格式化工具。
 *
 * 为什么放在 `app/utils/`？
 *   Nuxt 会自动导入该目录下的具名导出，所以组件里**不用写 import**
 *   就能直接用 `formatRelativeTime(...)`。这是 Nuxt 约定优于配置的一处体现。
 *
 * 注意 `utils/` 里只放**纯函数**（同样输入永远同样输出）。
 * 带状态的逻辑应该放 `composables/`。
 */

/**
 * 把 ISO 时间字符串变成"刚刚 / 5 分钟前 / 3 小时前 / 2 天前 / 具体日期"。
 *
 * 为什么要做相对时间而不是直接显示日期？
 *   帖子列表里读者真正关心的是"新不新"，
 *   而不是"它到底是 9 月 10 日 14 点 03 分"。
 *   相对时间把读者的脑力从"心算时间差"里解放出来。
 */
export function formatRelativeTime(iso: string): string {
  const target = new Date(iso).getTime()
  if (Number.isNaN(target)) return ''

  const diffSeconds = Math.floor((Date.now() - target) / 1000)

  if (diffSeconds < 60) return '刚刚'
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} 分钟前`
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} 小时前`
  if (diffSeconds < 86400 * 7) return `${Math.floor(diffSeconds / 86400)} 天前`

  // 超过一周就不再算相对时间了 —— "23 天前"读者反而要换算
  return formatDate(iso)
}

/** 格式化为 `2026-09-10` */
export function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 薄封装：取首字母的真正逻辑在 `packages/shared` 里。
 * 放在 `utils/` 下是为了被 Nuxt 自动导入，组件里直接用 `avatarInitial(...)`
 * 而无需写 import。改算法请改共享包。
 */
export function avatarInitial(username: string): string {
  return sharedAvatarInitial(username)
}
