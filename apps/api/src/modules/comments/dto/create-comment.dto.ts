import { ApiProperty } from '@nestjs/swagger'
import { IsString, Length } from 'class-validator'
import { COMMENT_MAX_LENGTH } from '@studyplan/shared'

/**
 * 发表评论的入参。
 *
 * 只有 `content` 一个字段，这一点值得注意：
 *   - `postId` **不在请求体里** —— 它在 URL 路径中（`/posts/:postId/comments`），
 *     这样"这条评论属于哪篇帖子"和"我请求的是哪个资源"是同一件事，
 *     不可能出现"路径说是 A、body 说是 B"的矛盾状态；
 *   - `author` 也不在请求体里 —— 它来自 Access Token（阶段 5 的成果）。
 *
 * > 一个好的 DTO 的特征是：**它只包含客户端真的有资格决定的东西。**
 */
export class CreateCommentDto {
  @ApiProperty({
    description: '评论内容',
    maxLength: COMMENT_MAX_LENGTH,
    example: '这一段的解释很到位，我正好卡在这里。',
  })
  @IsString({ message: 'content 必须是字符串' })
  @Length(1, COMMENT_MAX_LENGTH, {
    message: `content 长度必须在 1-${COMMENT_MAX_LENGTH} 之间`,
  })
  content!: string
}
