import { IsOptional, Matches } from 'class-validator'

/**
 * 撤回报道的入参。
 *
 * 只有 `date` 一个字段，而且是**可选**的：不传就是"撤今天"，
 * 那正是运维最常用的姿势 —— 撤掉刚发出来、看着不对的那篇。
 *
 * 为什么日期用 `Matches` 卡格式，而不是用 `IsDateString`：
 *   数据库里的日期键是**字符串** `YYYY-MM-DD`，不是 Date 对象。
 *   `IsDateString` 会放行 `2026-09-13T00:00:00Z` 这类写法，
 *   而那种值拿去查库一条都匹配不上 —— 调用方会得到"那天没有报道"，
 *   然后开始怀疑功能坏了。格式在这里卡死，比事后排查便宜得多。
 *
 * ⚠️ 全局管道开了 `forbidNonWhitelisted`，多传一个字段就直接 400。
 *    所以哪怕只有一个可选字段，也必须显式声明出来。
 */
export class RevokeDailyPickDto {
  /** 要撤回哪一天的报道，格式 `YYYY-MM-DD`；不传表示今天 */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date 必须是 YYYY-MM-DD 格式' })
  date?: string
}
