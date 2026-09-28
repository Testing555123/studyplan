import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsString, MaxLength, MinLength } from 'class-validator'
import { SEARCH_QUERY_MAX_LENGTH } from '@studyplan/shared'

export class SemanticSearchDto {
  @ApiProperty({ description: '要语义搜索的问题', maxLength: SEARCH_QUERY_MAX_LENGTH })
  @IsString({ message: 'query 必须是字符串' })
  // 本项目的 class-validator 版本没有 @Trim 装饰器，用 class-transformer 的
  // @Transform 先行 trim——纯空白串会变成空字符串，被下面的 MinLength 拦下返回 400
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1, { message: 'query 不能是空白' })
  @MaxLength(SEARCH_QUERY_MAX_LENGTH, {
    message: `query 最多 ${SEARCH_QUERY_MAX_LENGTH} 个字符`,
  })
  query!: string
}
