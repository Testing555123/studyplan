import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { JwtService, type JwtSignOptions } from '@nestjs/jwt'
import type { AuthResult, AuthTokens, PublicUser } from '@studyplan/shared'
import { UsersService } from '../users/users.service'
import { toPublicUser, type UserLean } from '../users/users.mapper'
import type { UserDocument } from '../users/schemas/user.schema'
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
} from '../../common/types/authenticated-user'
import type { RegisterDto } from './dto/register.dto'
import type { LoginDto } from './dto/login.dto'

/**
 * 一次会话的签发结果。
 *
 * 为什么它不直接等于 `AuthResult`（接口契约）？
 * 因为 **Refresh Token 不能出现在响应体里** —— 它要写进 httpOnly Cookie。
 * 所以服务层要多返回两个"只能往 Cookie 里放"的东西，
 * 由控制器负责塞进响应头。
 *
 * 如果让服务层直接操作 `Response` 对象，它就和 HTTP 绑死了，
 * 单测里就得伪造一个响应对象。现在的写法：服务只管签发，
 * 传输是控制器的事 —— 这正是分层该有的样子。
 */
export interface IssuedSession {
  /** 要返回给浏览器的部分（不含 Refresh Token） */
  result: AuthResult
  /** 要写进 httpOnly Cookie 的部分 */
  refreshToken: string
  /** Cookie 的存活毫秒数 */
  refreshMaxAgeMs: number
}

/**
 * 把 '15m' / '7d' / '30s' / '3600' 这样的时长字符串解析成秒数。
 *
 * 为什么要自己解析？
 *   因为 `jsonwebtoken` 能接受 '15m' 这种写法，但它不告诉你
 *   "这到底是几秒"。而前端需要知道 Access Token 的存活秒数，
 *   才能决定什么时候该去静默续期。
 *
 * 解析不出来时返回 0，调用方据此可以退化成"每次都用刷新接口"，
 * 而不是拿着一个 NaN 去参与计算（NaN 会一路污染下去，且不报错）。
 */
function parseDurationSeconds(value: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(value.trim())
  if (!match) return 0

  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return 0

  const unit = match[2] ?? 's'
  const multiplier: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 }

  return amount * (multiplier[unit] ?? 1)
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  private readonly accessSecret: string
  private readonly refreshSecret: string
  private readonly accessExpiresIn: string
  private readonly refreshExpiresIn: string

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    config: ConfigService,
  ) {
    // 在构造函数里一次性取出配置：既不重复读，也让类型收敛成 string
    this.accessSecret = config.getOrThrow<string>('JWT_ACCESS_SECRET')
    this.refreshSecret = config.getOrThrow<string>('JWT_REFRESH_SECRET')
    this.accessExpiresIn = config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m'
    this.refreshExpiresIn = config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d'

    /**
     * 启动时自检：两个密钥不能相同。
     *
     * 如果它们相同，双 Token 方案就退化成了单 Token ——
     * 攻击者拿到一个 Access Token 就能当 Refresh Token 用，
     * 换来一个长期有效的凭证。而系统表面上看不出任何异常。
     *
     * 所以宁可启动失败，也不能带着这个隐患运行。
     */
    if (this.accessSecret === this.refreshSecret) {
      throw new Error(
        'JWT_ACCESS_SECRET 与 JWT_REFRESH_SECRET 不能相同。' +
          '两个密钥相同会让双 Token 方案失去意义（Access Token 可直接当 Refresh Token 用）。',
      )
    }
  }

  /** 注册并直接登录 */
  async register(dto: RegisterDto): Promise<IssuedSession> {
    const created = await this.usersService.create({
      email: dto.email,
      username: dto.username,
      password: dto.password,
    })

    return this.issueSession(created)
  }

  /**
   * 登录。
   *
   * 关于错误信息：这里对"邮箱不存在"和"密码错误"返回**完全相同**的提示。
   * 如果区分开（"该邮箱未注册" / "密码错误"），就等于给攻击者提供了
   * 一个**账号枚举**工具：拿一堆邮箱试一遍，就能筛出哪些已注册。
   *
   * 一个诚实的说明：这里的 `if (!user)` 是提前返回的，
   * 所以"邮箱不存在"的响应会明显更快。理论上仍可通过**响应耗时**
   * 推断出账号是否存在。完整的做法是给不存在的情况也算一次 bcrypt
   * （用一个固定的假哈希）来对齐耗时。
   * 本项目为保持可读性没有做，但**你要知道这个缺口在哪**。
   */
  async login(dto: LoginDto): Promise<IssuedSession> {
    const user = await this.usersService.findByEmailWithPassword(dto.email)

    if (!user) {
      throw new UnauthorizedException('邮箱或密码不正确')
    }

    const passwordMatches = await this.usersService.verifyPassword(dto.password, user.passwordHash)

    if (!passwordMatches) {
      throw new UnauthorizedException('邮箱或密码不正确')
    }

    return this.issueSession(user)
  }

  /**
   * 用 Refresh Token 换一套新 Token。
   *
   * 为什么每次都**重新签发一套**（而不是只发 Access Token）？
   * 这叫 Refresh Token 轮换（rotation）。好处是：
   * 一个被盗的 Refresh Token 只要被真正用户用了一次刷新，
   * 它自己就失效了（因为服务端会跟着更新浏览器里的 Cookie）。
   *
   * ⚠️ 完整的轮换还需要在服务端记录"当前有效的 Refresh Token"，
   * 才能识别出"同一个 Refresh Token 被用了两次"这种盗用信号。
   * 本项目没做存储（见阶段 5 笔记里的取舍说明），
   * 所以这里的轮换只是"签一套新的"，安全性弱于完整实现。
   */
  async refresh(refreshToken: string | undefined): Promise<IssuedSession> {
    const invalid = new UnauthorizedException('登录状态已失效，请重新登录')

    if (!refreshToken) throw invalid

    let payload: RefreshTokenPayload
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.refreshSecret,
      })
    } catch {
      // 签名不对、已过期、格式非法 —— 对外都只说"失效"，
      // 不透露具体原因（那属于给攻击者的额外信息）。
      throw invalid
    }

    if (payload.type !== 'refresh') throw invalid

    const user = await this.usersService.findById(payload.sub)
    if (!user) throw invalid

    return this.issueSession(user)
  }

  /** 取当前登录用户的资料 */
  async getProfile(userId: string): Promise<PublicUser> {
    const user = await this.usersService.findById(userId)
    if (!user) {
      throw new UnauthorizedException('账号不存在，请重新登录')
    }
    return toPublicUser(user.toObject() as unknown as UserLean)
  }

  /**
   * 签发一套 Token。
   *
   * 注意两处 `secret` 是显式传进去的，而不是配在 `JwtModule.register()` 上。
   * 原因：本项目有**两套密钥**，如果配成全局默认值，
   * 就容易出现"签发 Refresh Token 时忘了传 secret，结果用了 Access 的密钥"
   * 这类问题 —— 而且它不会报错，只会让双 Token 的保护静默失效。
   *
   * 显式传参让"用哪个密钥"这件事在每个调用点都清晰可见。
   */
  private async issueSession(user: UserDocument): Promise<IssuedSession> {
    const publicUser = toPublicUser(user.toObject() as unknown as UserLean)

    const accessPayload: AccessTokenPayload = {
      sub: publicUser.id,
      email: publicUser.email,
      username: publicUser.username,
    }

    const refreshPayload: RefreshTokenPayload = {
      sub: publicUser.id,
      type: 'refresh',
      /**
       * 唯一编号。
       *
       * 没有它的话，同一秒内签发的两个 Refresh Token 会是
       * **同一个字符串**（因为 JWT 的 iat 只有秒级精度），
       * 轮换就形同虚设 —— 见 types/authenticated-user.ts 里的详细说明。
       * 这个坑是写单测时被"两个 Token 应该不同"这条断言揪出来的。
       */
      jti: randomUUID(),
    }

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.accessSecret,
      expiresIn: this.accessExpiresIn as JwtSignOptions['expiresIn'],
    })

    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshExpiresIn as JwtSignOptions['expiresIn'],
    })

    const tokens: AuthTokens = {
      accessToken,
      // 前端靠这个数字决定何时续期
      expiresIn: parseDurationSeconds(this.accessExpiresIn),
    }

    this.logger.log(`已签发会话：${publicUser.email}`)

    return {
      result: { user: publicUser, tokens },
      refreshToken,
      refreshMaxAgeMs: parseDurationSeconds(this.refreshExpiresIn) * 1000,
    }
  }
}
