import { ApiProperty } from '@nestjs/swagger'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, Length } from 'class-validator'
import {
  CONTENT_MAX_LENGTH,
  CONTENT_MIN_LENGTH,
  MAX_TAGS_PER_POST,
  POST_TAGS,
  TITLE_MAX_LENGTH,
  TITLE_MIN_LENGTH,
} from '@studyplan/shared'

/**
 * 创建帖子的入参。
 *
 * DTO 的职责只有一件事：**把不可信的输入变成可信的数据**。
 * 在 Controller 里手写 `if (!body.title) throw ...` 也能实现同样的效果，
 * 但那样会在每个接口里重复一遍，而且必然会有遗漏。
 *
 * 这里的所有校验规则都来自 `@studyplan/shared` ——
 * 前端 `posts/new.vue` 里显示的字数上限、标签数量上限，用的是**同一批常量**。
 * 这一条就消灭了前后端校验规则不一致这个经典问题。
 */
export class CreatePostDto {
  @ApiProperty({
    description: '文章标题',
    minLength: TITLE_MIN_LENGTH,
    maxLength: TITLE_MAX_LENGTH,
    example: 'Nuxt 4 的 app/ 目录到底改了什么',
  })
  @IsString({ message: 'title 必须是字符串' })
  @Length(TITLE_MIN_LENGTH, TITLE_MAX_LENGTH, {
    message: `title 长度必须在 ${TITLE_MIN_LENGTH}-${TITLE_MAX_LENGTH} 之间`,
  })
  title!: string

  @ApiProperty({
    description: 'Markdown 正文',
    minLength: CONTENT_MIN_LENGTH,
    maxLength: CONTENT_MAX_LENGTH,
  })
  @IsString({ message: 'content 必须是字符串' })
  @Length(CONTENT_MIN_LENGTH, CONTENT_MAX_LENGTH, {
    message: `content 长度必须在 ${CONTENT_MIN_LENGTH}-${CONTENT_MAX_LENGTH} 之间`,
  })
  content!: string

  @ApiProperty({
    description: '标签，必须来自全站白名单',
    example: ['Nuxt', 'Vue'],
    enum: POST_TAGS,
    minItems: 1,
    maxItems: MAX_TAGS_PER_POST,
  })
  @IsArray({ message: 'tags 必须是数组' })
  @ArrayMinSize(1, { message: '至少选择一个标签' })
  @ArrayMaxSize(MAX_TAGS_PER_POST, { message: `最多选择 ${MAX_TAGS_PER_POST} 个标签` })
  @IsIn(POST_TAGS as readonly string[], { each: true, message: '存在不在白名单里的标签' })
  tags!: string[]

  // ⚠️ 阶段 5 的重要改动，值得专门读一遍：
  //
  // 阶段 3 这里曾有两个临时字段 `authorId` / `authorUsername`，
  // 由客户端提交作者信息。那在真实产品里是**绝对不允许**的 ——
  // 任何人都可以伪造 authorId 冒充别人发帖。
  //
  // 现在作者信息由 `@CurrentUser()` 从**已通过签名校验的 JWT** 里取出，
  // 请求体里再也没有可以让客户端指定作者的地方。
  //
  // 这两个字段是被**删除**而不是"保留但忽略"，这是刻意的：
  //   - 只是忽略的话，前端还可能继续发送它，让人误以为它有用；
  //   - 删除之后，任何发送它的请求都会被全局管道的
  //     `forbidNonWhitelisted` 直接 400 拒绝，问题会立刻暴露。
  //
  // 这也是一堂规划课：阶段 3 那个"临时方案"的真实代价，
  // 就是此刻必须回来改 DTO、Service、Controller 和单测。
  // 临时方案不是免费的，它只是把成本延后了。
}
