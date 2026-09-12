import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import type { TrendingRange } from '@studyplan/shared'
import { DEFAULT_TRENDING_RANGE, TRENDING_RANGES } from '@studyplan/shared'

const RANGE_VALUES = TRENDING_RANGES.map((item) => item.value)

/**
 * 榜单查询参数。
 *
 * `range` 用白名单校验（`@IsIn`）而不是"先查再报错"：
 * 非法值会在这层就被挡掉并返回 400，Service 里可以无条件信任它。
 * 这符合项目在 `QueryPostsDto` 里定下的规矩 —— 校验集中在这一层，
 * 业务代码不做防御性判断。
 */
export class QueryTrendingDto {
  @ApiPropertyOptional({
    description: '时间档：该区间内创建的项目中 star 最高者',
    enum: RANGE_VALUES,
    default: DEFAULT_TRENDING_RANGE,
  })
  /**
   * 类型直接声明成 `TrendingRange` 而不是 `string`。
   *
   * 有人会问："反正运行时已经被 @IsIn 校验了，类型写 string 不也一样？"
   * 不一样 —— 写 string 的话，Service 里每用一次都要 `as TrendingRange`
   * 做一次断言。断言写多了，总有一天会在某个没校验到的路径上骗过编译器。
   * 让类型从这一层就是精确的，后面所有代码都不必再断言。
   */
  @IsOptional()
  @IsIn(RANGE_VALUES, { message: `range 只能是 ${RANGE_VALUES.join(' / ')}` })
  range: TrendingRange = DEFAULT_TRENDING_RANGE

  @ApiPropertyOptional({
    description: '按编程语言筛选；不传或传空则返回全部',
    example: 'TypeScript',
  })
  @IsOptional()
  @IsString()
  /**
   * 长度上限 50 是防御性的：这个参数会进数据库查询条件，
   * 虽然 MongoDB 不怕长字符串，但一个几百 KB 的查询条件
   * 足以拖慢一次索引查找。语言名现实中最长也就二十来个字符。
   */
  @MaxLength(50, { message: 'language 过长' })
  language?: string
}
