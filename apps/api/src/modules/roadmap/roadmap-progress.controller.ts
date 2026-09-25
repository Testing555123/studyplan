import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import type { RoadmapProgressResponse } from '@studyplan/shared'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { AuthenticatedUser } from '../../common/types/authenticated-user'
import { SetCourseStatusDto } from './dto/set-course-status.dto'
import { RoadmapProgressService } from './roadmap-progress.service'

/**
 * 学习路线进度接口（云同步，需登录）。
 *
 * 鉴权设计：`@UseGuards(JwtAuthGuard)` 挂在类上 —— 这个资源没有
 * "匿名可读"的部分。userId 一律取自 token（@CurrentUser），
 * 不接受任何 query/body 里的用户标识：能读写的只有本人。
 *
 * 全部返回 `RoadmapProgressResponse`（覆盖层 + 服务端聚合），
 * 幂等语义见 roadmap-progress.service.ts 顶部说明。
 */
@ApiTags('roadmap')
@Controller('roadmap/progress')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class RoadmapProgressController {
  constructor(private readonly progressService: RoadmapProgressService) {}

  @Get()
  @ApiOperation({
    summary: '获取我的路线覆盖层与聚合进度',
    description: '从未标记过时返回空覆盖层，聚合即官方默认。',
  })
  @ApiOkResponse({ description: '覆盖层 + 全量聚合' })
  @ApiUnauthorizedResponse({ description: '未登录' })
  getProgress(@CurrentUser() user: AuthenticatedUser): Promise<RoadmapProgressResponse> {
    return this.progressService.getProgress(user)
  }

  @Put(':courseId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '标记节点状态（幂等）',
    description: '表达目标状态而非切换动作，重复提交结果不变。返回服务端最新全量结果。',
  })
  @ApiParam({ name: 'courseId', description: '学习节点 slug，如 react-basics' })
  @ApiOkResponse({ description: '已达成目标状态，返回最新覆盖层与聚合' })
  @ApiUnauthorizedResponse({ description: '未登录' })
  @ApiNotFoundResponse({ description: '学习节点不存在' })
  setStatus(
    @Param('courseId') courseId: string,
    @Body() dto: SetCourseStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RoadmapProgressResponse> {
    return this.progressService.setStatus(courseId, dto.status, user)
  }

  @Delete(':courseId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '单节点恢复官方默认（幂等）',
    description: '本来没标记过也返回成功。',
  })
  @ApiParam({ name: 'courseId', description: '学习节点 slug' })
  @ApiOkResponse({ description: '该节点已从覆盖层移除，返回最新聚合' })
  @ApiUnauthorizedResponse({ description: '未登录' })
  @ApiNotFoundResponse({ description: '学习节点不存在' })
  resetCourse(
    @Param('courseId') courseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RoadmapProgressResponse> {
    return this.progressService.resetCourse(courseId, user)
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '重置全部个人进度',
    description: '删除整份覆盖层（个人数据的"删除权"入口）。',
  })
  @ApiOkResponse({ description: '覆盖层已清空，聚合回到官方默认' })
  @ApiUnauthorizedResponse({ description: '未登录' })
  resetAll(@CurrentUser() user: AuthenticatedUser): Promise<RoadmapProgressResponse> {
    return this.progressService.resetAll(user)
  }
}
