import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator'

/**
 * 提问上限 500 字。
 *
 * 这不是为了限制表达，而是**额度保护的第一道闸**：
 * 问题越长，消耗的 token 越多；而免费额度是按 token 算的。
 * 真有长问题，用户会自己精简 —— 500 字对"这段代码什么意思"绰绰有余。
 */
export const QUESTION_MAX_LENGTH = 500

/** 随提问一起带过来的项目上下文（来自 /trending 卡片） */
export class RepoContextDto {
  /**
   * 上下文类型。目前只有 'repo' 一种。
   *
   * ⚠️ 这个字段**必须声明，哪怕后端并不读它**。
   *
   * `ValidationPipe` 开了 whitelist + forbidNonWhitelisted，凡是 DTO 里
   * 没声明的属性都会让**整个请求 400**。而共享契约
   * `RepoQuestionContext` 里带了这个字段，前端
   * `useAiAssistant.askAboutRepo()` 也确实会把它发过来 ——
   *
   * 少了这一行，"卡片上的问 AI"每次都会失败，而报错信息
   * （"context.property type should not exist"）完全不提是哪一方的问题，
   * 排查时得从共享类型一路对到 DTO 才能发现。**契约两端不一致，
   * 就该在两端都对上**：要么都留，要么都删。这里选择留，是因为将来若要
   * 支持别的上下文（比如"问某个帖子"），它正好是现成的判别字段。
   */
  @ApiPropertyOptional({ description: '上下文类型', enum: ['repo'], default: 'repo' })
  @IsOptional()
  @IsString()
  @IsIn(['repo'])
  type?: 'repo'

  @ApiProperty({ description: '仓库全名，如 nestjs/nest', example: 'nestjs/nest' })
  @IsString()
  @MaxLength(200)
  fullName!: string

  @ApiPropertyOptional({ description: '项目简介，可能为 null' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null

  @ApiPropertyOptional({ description: '主要语言，可能为 null' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  language?: string | null

  @ApiProperty({ description: '仓库地址' })
  @IsString()
  @MaxLength(300)
  htmlUrl!: string
}

export class AskAiDto {
  @ApiProperty({ description: '要问的问题', maxLength: QUESTION_MAX_LENGTH })
  @IsString()
  @MinLength(2, { message: '问题太短了' })
  @MaxLength(QUESTION_MAX_LENGTH, { message: `问题最多 ${QUESTION_MAX_LENGTH} 字` })
  question!: string

  /**
   * 上下文。
   *
   * 用 `ValidateNested` + `@Type` 才能让嵌套对象也被校验 ——
   * 少了 `@Type`，class-transformer 不知道要转成哪个类，
   * 嵌套的约束会被**静默跳过**（不报错，只是不生效），
   * 这类问题排查起来非常费时间。
   */
  @ApiPropertyOptional({ description: '项目上下文；不传则视为询问本站代码或通用技术问题' })
  @IsOptional()
  @ValidateNested()
  @Type(() => RepoContextDto)
  context?: RepoContextDto | null
}
