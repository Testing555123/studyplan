/**
 * 生成式头像的配色方案。
 *
 * 为什么把这段逻辑放进共享包，而不是前后端各写一份？
 *   因为"同一个用户名必须得到同一种颜色"这件事**必须两端一致**：
 *   后端注册时把颜色算好存进数据库，前端渲染时也要能算出兜底色。
 *   如果两边的算法或色板有哪怕一点差别，同一个用户就会出现两种颜色 ——
 *   而这种 bug 极难被发现，因为单看任何一端都是"对的"。
 *
 * 做法本身很朴素：把用户名按位累加得到一个整数，再对色板长度取模。
 * 关键是它**确定性**：同样的输入永远得到同样的输出，不依赖随机数、
 * 不依赖时间、不依赖进程。
 */

/**
 * Tailwind 的渐变工具类。后端直接把其中一个字符串存进数据库。
 *
 * ⚠️ 改这个数组会**改变已有用户的头像颜色**（下标不变但对应色变了）。
 *    所以只能改某一项的内容，**不要改数组长度、也不要重排顺序** ——
 *    长度一变，`avatarGradientIndex` 的取模结果就全变了，
 *    所有人的头像颜色会集体跳变。
 *
 * 第一项用 `brand`（青蓝主色），让头像与全站主色呼应；
 * 其余保持彩色，是为了让不同用户有辨识度 ——
 * 头像的"多样性"本身就是设计目的，不该被主色统一掉。
 */
export const AVATAR_GRADIENTS = [
  'from-brand-400 to-brand-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-violet-500 to-purple-600',
  'from-sky-500 to-blue-600',
] as const

export type AvatarGradient = (typeof AVATAR_GRADIENTS)[number]

/**
 * 由任意字符串稳定地得到一个色板下标。
 *
 * 用 31 这个乘数是因为它是一个小质数，能让相邻字符的差异
 * 更快地扩散到高位（哈希表实现里常用的做法）。
 * 再对 997 取模是为了避免数值无限增长后超出安全整数范围。
 */
export function avatarGradientIndex(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 997
  }
  return hash % AVATAR_GRADIENTS.length
}

/** 直接拿到渐变类名 */
export function avatarGradientClass(seed: string): AvatarGradient {
  return AVATAR_GRADIENTS[avatarGradientIndex(seed)]
}

/**
 * 头像上显示的文字：中文取第一个字，英文取首字母大写。
 * 空字符串兜底成 '?'，避免界面出现一个空白圆圈。
 */
export function avatarInitial(username: string): string {
  const first = username.trim().charAt(0)
  return first ? first.toUpperCase() : '?'
}
