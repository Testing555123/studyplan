import { ApiProperty } from '@nestjs/swagger'
import { ArrayMaxSize, IsArray, IsInt } from 'class-validator'

/**
 * 批量取简介的入参。
 *
 * 只收 id 数组，不收仓库对象：
 *   让前端把上百个仓库的完整数据再传回来，既浪费带宽，
 *   又给了调用方"随便编一个项目让 AI 写简介"的机会。
 *   只给 id，后端自己从缓存或快照里解析 —— 解析不到就跳过，不生成。
 *
 * 上限 100 与 GitHub 搜索的 `per_page` 一致：
 * 榜单一次最多就返回这么多，没有理由让这个接口接受更多。
 */
export class BatchIntroDto {
  @ApiProperty({
    description: '要取简介的 GitHub 仓库 id 列表',
    type: [Number],
    example: [10270250, 23064770],
  })
  @IsArray({ message: 'repoIds 必须是数组' })
  @ArrayMaxSize(100, { message: '一次最多请求 100 个仓库的简介' })
  @IsInt({ each: true, message: 'repoIds 里每一项都必须是整数' })
  repoIds!: number[]
}
