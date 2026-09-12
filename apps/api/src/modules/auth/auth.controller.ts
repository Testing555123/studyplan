import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import type { Request, Response } from 'express'
import type { AuthResult, PublicUser } from '@studyplan/shared'
import { AuthService, type IssuedSession } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { AuthenticatedUser } from '../../common/types/authenticated-user'
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { REFRESH_COOKIE_NAME, readCookie } from '../../common/utils/cookies'

/**
 * 限流窗口。
 *
 * ⚠️ 单位是**毫秒**（@nestjs/throttler v5 起），不是秒。
 * 写成 60 会变成 60 毫秒 —— 那等于把所有请求都拒了。
 */
const ONE_MINUTE_MS = 60_000

/**
 * Refresh Cookie 只允许发给认证接口。
 *
 * 这是"最小暴露面"原则：如果 path 写成 '/'，
 * 那么用户每次拉帖子列表、每次加载图片，浏览器都会把这个 Cookie
 * 一起带上。虽然它是 httpOnly 的，多带并不会直接泄漏，
 * 但它增加了被日志、代理、错误上报工具记录下来的机会。
 *
 * 用 path 把它限制在 `/api/auth` 下 —— 只有真正需要它的
 * 刷新/登出接口才会收到它。
 */
const REFRESH_COOKIE_PATH = '/api/auth'

/**
 * 认证接口是**被针对性攻击**的重灾区：撞库、批量注册、刷 Token。
 * 所以整个控制器挂上 ThrottlerGuard，再按方法给不同配额。
 *
 * 没有被 `@SkipThrottle()` 标记的方法，使用 app.module 里的默认档位（30 次/分钟）。
 */
@ApiTags('auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  private readonly isProduction: boolean
  private readonly cookieSameSite: 'lax' | 'none' | 'strict'

  constructor(
    private readonly authService: AuthService,
    config: ConfigService,
  ) {
    this.isProduction = config.get<string>('NODE_ENV') === 'production'

    /**
     * SameSite 的取值直接决定了"跨站时 Cookie 会不会被带上"：
     *
     *   lax    —— 同站请求会带（本地开发时 3001 → 3000 属于同站，可用）
     *   none   —— 跨站也带，但**必须同时开 secure（即 HTTPS）**，
     *             否则浏览器直接丢弃这个 Cookie
     *   strict —— 只有同站带，最安全但会让人从外部链接点进来时丢登录态
     *
     * 阶段 8 部署时如果前后端在不同域名下（比如 vercel.app 与 onrender.com），
     * 它们属于**不同站点**，lax 会拦下这个 Cookie ——
     * 那时必须改成 none，并且后端要跑在 HTTPS 上。
     * 所以这里做成可配置项，而不是写死。
     */
    const sameSite = (config.get<string>('COOKIE_SAME_SITE') ?? 'lax').toLowerCase()
    this.cookieSameSite = sameSite === 'none' || sameSite === 'strict' ? sameSite : 'lax'
  }

  /**
   * 注册配额最紧（5 次/分钟）：
   * 正常用户不可能一分钟注册 5 次，而批量注册脚本会立刻撞上。
   */
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: ONE_MINUTE_MS } })
  @ApiOperation({ summary: '注册并直接登录', description: '成功后会在响应里写入 Refresh Cookie。' })
  @ApiCreatedResponse({ description: '注册成功，返回用户信息与 Access Token' })
  @ApiConflictResponse({ description: '邮箱已被注册' })
  async register(
    @Body() dto: RegisterDto,
    // passthrough: true 让 Nest 继续正常序列化返回值，
    // 我们只是"顺便"往响应上加一个 Set-Cookie 头
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResult> {
    const session = await this.authService.register(dto)
    this.writeRefreshCookie(response, session)
    return session.result
  }

  /** 登录稍宽（10 次/分钟）：要容忍输错密码，但要挡住撞库 */
  @Post('login')
  @Throttle({ default: { limit: 10, ttl: ONE_MINUTE_MS } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '登录', description: '成功后会在响应里写入 Refresh Cookie。' })
  @ApiOkResponse({ description: '登录成功，返回用户信息与 Access Token' })
  @ApiUnauthorizedResponse({ description: '邮箱或密码不正确' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResult> {
    const session = await this.authService.login(dto)
    this.writeRefreshCookie(response, session)
    return session.result
  }

  /**
   * 刷新接口配额刻意放宽（60 次/分钟）。
   * 因为它由前端**自动**调用（收到 401 时），限太紧会把正常用户踢下线。
   */
  @Post('refresh')
  @Throttle({ default: { limit: 60, ttl: ONE_MINUTE_MS } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '用 Refresh Cookie 换一套新 Token',
    description:
      '前端在收到 401 时会自动调用它，用户无需感知。Refresh Token 从 httpOnly Cookie 读取，不经过 JavaScript。',
  })
  @ApiOkResponse({ description: '续期成功，返回新的 Access Token 并轮换 Refresh Cookie' })
  @ApiUnauthorizedResponse({ description: 'Refresh Token 缺失、过期或无效' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResult> {
    const session = await this.authService.refresh(readCookie(request, REFRESH_COOKIE_NAME))
    this.writeRefreshCookie(response, session)
    return session.result
  }

  /**
   * 登出。
   *
   * 刻意**不加守卫**：即使 Access Token 已经过期，
   * 用户也应该能成功登出（清掉 Cookie）。
   * 如果加了守卫，一个过期 Token 会让登出失败，
   * 用户就会陷入"退不出去"的状态 —— 而登出本身是纯无害操作。
   */
  /** 登出是纯无害操作，不该被限流挡住（否则"退不出去"比"被限流"更糟） */
  @Post('logout')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '登出（清除 Refresh Cookie）' })
  @ApiOkResponse({ description: '已清除登录状态' })
  logout(@Res({ passthrough: true }) response: Response): { ok: true } {
    this.clearRefreshCookie(response)
    return { ok: true }
  }

  /** 已登录用户的只读查询，限流只会伤害正常体验 */
  @Get('me')
  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '获取当前登录用户资料' })
  @ApiOkResponse({ description: '当前用户信息' })
  @ApiUnauthorizedResponse({ description: '未登录或 Access Token 无效' })
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<PublicUser> {
    return this.authService.getProfile(user.id)
  }

  /**
   * 写入 Refresh Cookie。
   *
   * 三个关键标志位，每个都在防一件具体的事：
   *
   *   httpOnly —— JavaScript 读不到。这是本方案的核心：
   *               XSS 能偷走内存里的 Access Token（但那个只有 15 分钟），
   *               却偷不走这个长期凭证。
   *
   *   sameSite —— 跨站请求不自动携带，免疫 CSRF。
   *
   *   secure   —— 只在 HTTPS 上传输，防中间人窃听。
   *               生产环境必须为 true；本地开发是 http，开了会导致
   *               浏览器直接丢掉这个 Cookie，所以按环境区分。
   */
  private writeRefreshCookie(response: Response, session: IssuedSession): void {
    response.cookie(REFRESH_COOKIE_NAME, session.refreshToken, {
      httpOnly: true,
      sameSite: this.cookieSameSite,
      secure: this.isProduction,
      path: REFRESH_COOKIE_PATH,
      maxAge: session.refreshMaxAgeMs,
    })
  }

  /**
   * 清除 Refresh Cookie。
   *
   * 注意 `path` 必须与写入时**完全一致**，否则浏览器认为是两个不同的
   * Cookie，只会删掉一个不存在的，登录态依然留着。
   * 这是"登出没生效"最常见的原因。
   */
  private clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      sameSite: this.cookieSameSite,
      secure: this.isProduction,
      path: REFRESH_COOKIE_PATH,
    })
  }
}
