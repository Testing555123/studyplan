import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
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
import type { Post as PostContract, PostListResponse } from '@studyplan/shared'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { AuthenticatedUser } from '../../common/types/authenticated-user'
import { PostsService } from './posts.service'
import { CreatePostDto } from './dto/create-post.dto'
import { UpdatePostDto } from './dto/update-post.dto'
import { QueryPostsDto } from './dto/query-posts.dto'

/**
 * 帖子接口层。
 *
 * 注意这个文件有多"薄"：每个方法只有一行。
 * 这不是偷懒，而是**分层是否清晰的直接体现** ——
 * Controller 里但凡出现 `if`，通常意味着某个业务判断放错了地方。
 *
 * 它真正做的事只有三件：
 *   1. 用装饰器把"HTTP 世界"翻译成"函数调用"；
 *   2. 用 DTO 声明"什么输入是合法的"（校验由全局管道执行）；
 *   3. 用 Swagger 装饰器把接口文档化 —— 这是**代码即文档**，
 *      改了代码文档自动跟着变，不会像手写文档那样过期。
 */
@ApiTags('posts')
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  @ApiOperation({
    summary: '分页获取帖子列表',
    description: '按创建时间倒序。可通过 tag 参数按标签筛选。',
  })
  @ApiOkResponse({ description: '分页结果，包含 items / total / page / pageSize' })
  @ApiBadRequestResponse({ description: '查询参数不合法（如 page 不是整数）' })
  findAll(@Query() query: QueryPostsDto): Promise<PostListResponse> {
    return this.postsService.findAll(query)
  }

  @Get(':id')
  @ApiOperation({ summary: '获取单篇帖子' })
  @ApiParam({ name: 'id', description: '帖子的 ObjectId', example: '507f1f77bcf86cd799439011' })
  @ApiOkResponse({ description: '帖子详情' })
  @ApiNotFoundResponse({ description: '帖子不存在（id 非法或已被删除）' })
  findOne(@Param('id') id: string): Promise<PostContract> {
    return this.postsService.findOne(id)
  }

  /** 发帖限额（10 次/分钟）：挡住灌水机器人，不影响正常创作 */
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '创建帖子（需要登录）',
    description: '作者信息取自 Access Token，**请求体无法指定作者**。',
  })
  @ApiCreatedResponse({ description: '创建成功，返回新帖子' })
  @ApiBadRequestResponse({ description: '参数校验失败，details 里会逐条列出原因' })
  @ApiUnauthorizedResponse({ description: '未登录或 Access Token 无效' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePostDto,
  ): Promise<PostContract> {
    return this.postsService.create(dto, user)
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '更新帖子（只更新传入的字段，且只能改自己的）' })
  @ApiParam({ name: 'id', description: '帖子的 ObjectId' })
  @ApiOkResponse({ description: '更新后的帖子' })
  @ApiForbiddenResponse({ description: '这不是你发布的文章' })
  @ApiNotFoundResponse({ description: '帖子不存在' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PostContract> {
    return this.postsService.update(id, dto, user)
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  /**
   * 默认情况下 POST/DELETE 成功会返回 201/200 加一个空 body，
   * 而语义上更准确的做法是 **204 No Content**：
   * "操作成功，且我没有东西要告诉你"。
   * 显式声明比让调用方去猜 body 为什么是空的好。
   */
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除帖子（只能删自己的）' })
  @ApiParam({ name: 'id', description: '帖子的 ObjectId' })
  @ApiNoContentResponse({ description: '删除成功，无响应体' })
  @ApiForbiddenResponse({ description: '这不是你发布的文章' })
  @ApiNotFoundResponse({ description: '帖子不存在' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.postsService.remove(id, user)
  }
}
