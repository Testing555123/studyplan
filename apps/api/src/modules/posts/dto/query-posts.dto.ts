import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator'
import { MAX_PAGE_SIZE, POST_PAGE_SIZE, POST_TAGS } from '@studyplan/shared'

/**
 * 帖子列表的查询参数。
 *
 * 三个值得注意的点：
 *
 * 1. **HTTP 的查询参数永远是字符串**。`?page=2` 传过来是 `'2'` 而不是 `2`。
 *    `@Type(() => Number)` 加上全局 ValidationPipe 的 `transform: true`
 *    才会把它转成数字。不加这一步，`page` 会变成字符串，
 *    而 `(page - 1) * pageSize` 会得到 `NaN` —— 然后你得到一份空列表，
 *    却完全看不出哪里错了。
 *
 * 2. **必须限制 pageSize 上限**（MAX_PAGE_SIZE）。否则有人请求
 *    `?pageSize=1000000`，你的数据库就要一次性吐出一百万条文档。
 *    这是最常见的、也最容易被忽略的接口滥用点。
 *
 * 3. **默认值写在属性初始化里**而不是在 Service 里兜底。
 *    这样 Swagger 能显示默认值，Service 也能无条件信任 DTO。
 */
export class QueryPostsDto {
  @ApiPropertyOptional({ description: '页码，从 1 开始', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page 必须是整数' })
  @Min(1, { message: 'page 最小为 1' })
  page: number = 1

  @ApiPropertyOptional({
    description: '每页数量',
    default: POST_PAGE_SIZE,
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize 必须是整数' })
  @Min(1, { message: 'pageSize 最小为 1' })
  @Max(MAX_PAGE_SIZE, { message: `pageSize 最大为 ${MAX_PAGE_SIZE}` })
  pageSize: number = POST_PAGE_SIZE

  @ApiPropertyOptional({
    description: '按标签筛选；不传则返回全部',
    enum: POST_TAGS,
  })
  @IsOptional()
  @IsIn(POST_TAGS as readonly string[], { message: 'tag 不在白名单内' })
  tag?: string
}
