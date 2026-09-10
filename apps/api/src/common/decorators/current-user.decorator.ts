import { UnauthorizedException, createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'
import type { AuthenticatedUser } from '../types/authenticated-user'

/**
 * 取当前登录用户的参数装饰器。
 *
 * 用法：
 *
 * ```ts
 * @UseGuards(JwtAuthGuard)
 * @Post()
 * create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePostDto) {
 *   // user 一定是登录用户，且它的内容来自验证过的 Token
 * }
 * ```
 *
 * 对比一下"不用装饰器"会写成什么样：
 *
 * ```ts
 * create(@Req() req: Request) {
 *   const user = req.user as AuthenticatedUser   // 需要断言，类型不安全
 *   ...
 * }
 * ```
 *
 * 装饰器把这个断言收在一个地方，业务代码拿到的是**强类型**的对象。
 *
 * 这里抛 401 而不是静默返回 undefined，是一个刻意的设计：
 * 如果哪天有人忘了加 `@UseGuards(JwtAuthGuard)`，
 * 这个异常会立刻在开发阶段暴露出来，
 * 而不是让一个 id 为 undefined 的"用户"去数据库里写脏数据。
 *
 * > **宁可大声失败，也不要安静地做错事。**
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>()

    if (!request.user) {
      throw new UnauthorizedException('这个操作需要登录后才能进行')
    }

    return request.user
  },
)
