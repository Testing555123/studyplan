import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsString, MaxLength, MinLength } from 'class-validator'
import { ASK_QUESTION_MAX_LENGTH } from '@studyplan/shared'

export class AskPostsDto {
  @ApiProperty({ description: '要问全书的问题', maxLength: ASK_QUESTION_MAX_LENGTH })
  @IsString({ message: 'question 必须是字符串' })
  // 同 SemanticSearchDto：本项目 class-validator 版本无 @Trim，用 @Transform 先行 trim
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1, { message: 'question 不能是空白' })
  @MaxLength(ASK_QUESTION_MAX_LENGTH, {
    message: `question 最多 ${ASK_QUESTION_MAX_LENGTH} 个字符`,
  })
  question!: string
}
