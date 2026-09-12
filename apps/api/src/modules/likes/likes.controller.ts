import { Controller, Delete, HttpCode, HttpStatus, Param, Put, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import type { LikeResult } from '@studyplan/shared'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { AuthenticatedUser } from '../../common/types/authenticated-user'
import { LikesService } from './likes.service'

/**
 * 点赞接口。
 *
 * 用 PUT / DELETE 两个幂等的接口，而不是一个 POST 切换 ——
 * 理由见 `likes.service.ts` 顶部的说明。
 *
 * 两个接口都返回**服务端的真实计数**（`LikeResult`），
 * 这样前端可以拿它覆盖乐观更新的结果，纠正任何偏差。
 */
@ApiTags('likes')
@Controller('posts/:postId/like')
export class LikesController {
  constructor(private readonly likesService: LikesService) {}

  @Put()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '点赞（幂等）',
    description: '重复调用不会重复计数。返回服务端的最新点赞数，前端可用它校正乐观更新。',
  })
  @ApiParam({ name: 'postId', description: '帖子的 ObjectId' })
  @ApiOkResponse({ description: '已点赞，返回最新计数' })
  @ApiUnauthorizedResponse({ description: '未登录' })
  @ApiNotFoundResponse({ description: '帖子不存在' })
  like(@Param('postId') postId: string, @CurrentUser() user: AuthenticatedUser): Promise<LikeResult> {
    return this.likesService.like(postId, user)
  }

  @Delete()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '取消点赞（幂等）',
    description: '本来没点赞也返回成功。',
  })
  @ApiParam({ name: 'postId', description: '帖子的 ObjectId' })
  @ApiOkResponse({ description: '已取消点赞，返回最新计数' })
  @ApiUnauthorizedResponse({ description: '未登录' })
  @ApiNotFoundResponse({ description: '帖子不存在' })
  unlike(
    @Param('postId') postId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LikeResult> {
    return this.likesService.unlike(postId, user)
  }
}
