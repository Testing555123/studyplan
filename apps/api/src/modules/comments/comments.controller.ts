import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import type { Comment as CommentContract, CommentListResponse } from '@studyplan/shared'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { AuthenticatedUser } from '../../common/types/authenticated-user'
import { CommentsService } from './comments.service'
import { CreateCommentDto } from './dto/create-comment.dto'

/**
 * 评论接口。
 *
 * ── 关于路由设计的一个取舍 ──
 *
 * 注意这里的 `@Controller()` 是**空的**，路由全都写在了方法上：
 *   GET    /posts/:postId/comments
 *   POST   /posts/:postId/comments
 *   DELETE /comments/:id
 *
 * 为什么不写成 `@Controller('posts/:postId/comments')`？
 *   因为删除评论用的是 `/comments/:id` —— 评论 id 本身已经唯一，
 *   不需要再从帖子路径里绕一圈。硬套嵌套路由会得到
 *   `/posts/:postId/comments/:id`，多一个参数却没有任何信息量。
 *
 * 一般原则：**嵌套路径表达"从属关系"，但如果子资源本身已经全局唯一，
 * 用扁平路径更简洁。** 两种都能用，别为了形式统一而制造冗余参数。
 */
@ApiTags('comments')
@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get('posts/:postId/comments')
  @ApiOperation({ summary: '获取某篇帖子的评论列表', description: '按时间正序，最早的在前。' })
  @ApiParam({ name: 'postId', description: '帖子的 ObjectId' })
  @ApiOkResponse({ description: '评论列表' })
  @ApiNotFoundResponse({ description: '帖子不存在' })
  findByPost(@Param('postId') postId: string): Promise<CommentListResponse> {
    return this.commentsService.findByPost(postId)
  }

  @Post('posts/:postId/comments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '发表评论（需要登录）',
    description: '作者取自 Access Token；postId 取自路径，两者都不接受客户端指定。',
  })
  @ApiParam({ name: 'postId', description: '帖子的 ObjectId' })
  @ApiCreatedResponse({ description: '创建成功，返回新评论' })
  @ApiBadRequestResponse({ description: '内容为空或超长' })
  @ApiUnauthorizedResponse({ description: '未登录' })
  create(
    @Param('postId') postId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CommentContract> {
    return this.commentsService.create(postId, dto, user)
  }

  @Delete('comments/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除自己的评论' })
  @ApiParam({ name: 'id', description: '评论的 ObjectId' })
  @ApiNoContentResponse({ description: '删除成功，无响应体' })
  @ApiForbiddenResponse({ description: '这不是你发表的评论' })
  @ApiNotFoundResponse({ description: '评论不存在' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.commentsService.remove(id, user)
  }
}
