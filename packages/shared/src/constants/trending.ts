import type { TrendingRange } from '../types/github'

/**
 * 五个时间档的定义。
 *
 * 放在共享包而不是后端，是因为**两端都要用同一份**：
 *   · 后端拿 `days` 去拼 `created:>=YYYY-MM-DD` 查询条件；
 *   · 前端拿 `label` 去渲染那排切换按钮。
 * 各写一份的后果很典型：后端加了 '3m'、前端按钮还是四个，
 * 用户就永远点不到那个档位 —— 而且没有任何报错。
 */
export interface TrendingRangeMeta {
  value: TrendingRange
  /** 按钮上的中文标签 */
  label: string
  /** 回溯天数，用于计算 created:>= 的起始日期 */
  days: number
}

export const TRENDING_RANGES: readonly TrendingRangeMeta[] = [
  { value: '1d', label: '1 天', days: 1 },
  { value: '7d', label: '7 天', days: 7 },
  { value: '1m', label: '1 月', days: 30 },
  { value: '3m', label: '3 月', days: 90 },
  { value: '1y', label: '1 年', days: 365 },
]

/**
 * 默认时间档。
 *
 * 选 7 天而不是 1 天：1 天内新建的项目 star 普遍只有个位数，
 * 榜单会显得很空、也看不出"热门"；7 天既能保证一定数据量，
 * 又足够"新鲜"，是榜单类产品的常见默认区间。
 */
export const DEFAULT_TRENDING_RANGE: TrendingRange = '7d'

/** 判断一个字符串是否是合法的时间档。用于校验地址栏 ?range= 参数 */
export function isTrendingRange(value: unknown): value is TrendingRange {
  return TRENDING_RANGES.some((item) => item.value === value)
}

/** 按时间档取回溯天数；传入非法值时回落到默认档，不抛异常 */
export function rangeToDays(range: TrendingRange): number {
  return TRENDING_RANGES.find((item) => item.value === range)?.days ?? 7
}
