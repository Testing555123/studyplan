import type { ConfigService } from '@nestjs/config'

/**
 * 环境变量取值的两个小助手。
 *
 * ── 为什么值得为几行代码单独建一个文件 ──
 *
 * 环境变量取回来永远是**字符串**，没配时是 `undefined` 或空串，
 * 而"转成布尔 / 转成数字"这件事每个可选功能都要做一遍。
 *
 * 各写一份的代价不只是重复几行，而是**容错口径会慢慢漂移**：
 * 一处认为 `'1'` 是真、另一处不认；一处把 0 当无效、另一处当有效。
 * 这种差异不会报错，只会在某天某个人配了 `'1'` 之后，
 * 表现为"这个功能有时候生效有时候不生效"，极难排查。
 * 抽出来之后，口径只有一份。
 *
 * ── 这里不做校验 ──
 *
 * 校验是 `env.validation.ts` 的职责（启动时 fail fast，配置错了直接崩）。
 * 这里只负责"把已经通过校验的值安全地读出来，读不到就退回默认值" ——
 * 两个职责分开，才不会出现"读个默认值还要先过一遍校验"的别扭代码。
 */

/** 读布尔。没配（undefined / 空串）时用默认值；`'true'` 与 `'1'` 都算真 */
export function boolSetting(config: ConfigService, key: string, fallback: boolean): boolean {
  const raw = config.get<string>(key)
  if (raw === undefined || raw === '') return fallback
  return raw === 'true' || raw === '1'
}

/** 读正数。非数字、NaN、0、负数一律退回默认值 */
export function numberSetting(config: ConfigService, key: string, fallback: number): number {
  const raw = Number(config.get<string>(key))
  // Number(undefined) 与 Number('abc') 都是 NaN，这里一并兜住
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

/**
 * 读非负数（**0 算有效值**）。非数字、NaN、负数退回默认值。
 *
 * ── 为什么不能用上面那个 `numberSetting` ──
 *
 * 它把 0 当成"没配好"而退回默认值。对"至少为 1"的配置这是对的
 * （0 天的有效期、0 条批次都没有意义），但对下面这类配置就是**错的**：
 *
 *   · `DAILY_DIGEST_PUBLISH_HOUR=0` → "0 点之后即可生成"，正常取值；
 *   · `DAILY_DIGEST_MIN_STARS=0`    → "不限 star"，正常取值。
 *
 * 这两个变量的校验规则（`env.validation.ts`）里写的是 `@Min(0)`，
 * 也就是说 0 被明确允许；读的时候却把它换成 9 点、50 star，
 * 结果就是"配了 0 却按默认值生效"，而且一声不响 ——
 * 与"配了却没生效"是同一类最难查的问题。
 *
 * 口径依然只有一份：0 怎么算、什么算非法，都在这个文件里定。
 */
export function nonNegativeSetting(
  config: ConfigService,
  key: string,
  fallback: number,
): number {
  const value = config.get<string>(key)

  /**
   * ⚠️ 必须先看原始值，不能只看 `Number(...)`：
   * `Number('')` 是 0，`Number(undefined)` 是 NaN。
   * 直接判 `>= 0` 会把"没配"当成"配了 0"，默认值就永远生效不了。
   */
  if (value === undefined || value === '') return fallback

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}
