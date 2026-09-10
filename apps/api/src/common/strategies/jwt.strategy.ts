import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import type { AccessTokenPayload, AuthenticatedUser } from '../types/authenticated-user'

/**
 * JWT 校验策略。
 *
 * 它是"守卫"背后的真正执行者。整个流程是这样的：
 *
 * ```text
 * 请求带着 Authorization: Bearer xxx 进来
 *          ▼
 *   JwtAuthGuard（守门人，只负责"拦住"）
 *          ▼
 *   JwtStrategy（真正的验证者）
 *     ① 从请求头里取出 Token
 *     ② 用密钥验签名、验过期时间
 *     ③ 验证通过后调用下面的 validate()
 *          ▼
 *   validate() 的返回值被挂到 request.user 上
 *          ▼
 *   业务代码通过 @CurrentUser() 拿到它
 * ```
 *
 * 这里有一个**极其重要**的安全事实需要理解清楚：
 *
 * > JWT 的 payload 是**可以被任何人解码阅读**的（它只是 Base64 编码，不是加密），
 * > 但**不能被伪造**（改一个字节，签名就失效）。
 *
 * 所以 payload 里绝不能放敏感信息（别放密码、别放身份证号），
 * 但可以放心地用里面的 `sub`（用户 id）来做身份识别 ——
 * 因为它已经过签名校验，是你自己签发的。
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      /**
       * 从哪里取 Token。
       * 从 `Authorization: Bearer xxx` 头里取，是业界事实标准。
       *
       * 为什么不用 Cookie 传 Access Token？
       * 因为放在请求头里，它就**不会随任何跨站请求自动发送**，
       * 天然免疫 CSRF。这正是双 Token 方案里把两个 Token
       * 分开存放的核心动机。
       */
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      /**
       * 是否忽略过期。
       *
       * 必须是 false。设成 true 等于"过期 Token 永久有效"，
       * 那 Access Token 短有效期的设计就完全失去意义了。
       */
      ignoreExpiration: false,

      /**
       * 验签名用的密钥 —— 与签发时用的**必须是同一个**。
       * 用 getOrThrow 而不是 get：env.validation 已经保证它存在，
       * 这样类型能收敛成 string，省掉一次无意义的空值判断。
       */
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    })
  }

  /**
   * 签名验证通过后会被调用。
   *
   * 返回值会被 Passport 挂到 `request.user` 上，业务代码通过
   * `@CurrentUser()` 取用。所以这个方法的返回值**就是"当前用户"的定义**。
   *
   * 注意这里做了一层转换：把 Token 的 `sub` 映射成更好读的 `id`。
   * 这样做的好处是业务代码里永远写 `user.id`，
   * 而不需要记住"JWT 里用的是 sub 这个标准声明名"。
   *
   * 这个方法还能做一件很有用的事：**检查用户在签发 Token 之后是否被删除或封禁**。
   * 本项目没做（每次请求都查库会抵消 JWT 无状态的优势），
   * 但你要知道这个位置就是那个决策点。
   */
  validate(payload: AccessTokenPayload): AuthenticatedUser {
    if (!payload.sub) {
      // 理论上不会发生（能签出这种 Token 说明是我们自己的 bug），
      // 但防守一下：宁可 401，也不要把一个 id 为 undefined 的用户传下去。
      throw new UnauthorizedException('登录凭证无效，请重新登录')
    }

    return {
      id: payload.sub,
      email: payload.email,
      username: payload.username,
    }
  }
}
