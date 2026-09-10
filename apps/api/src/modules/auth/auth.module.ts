import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { UsersModule } from '../users/users.module'
import { JwtStrategy } from '../../common/strategies/jwt.strategy'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'

/**
 * 认证模块。
 *
 * ## 为什么 `JwtModule.register({})` 是空的？
 *
 * 这是本项目一个刻意的设计决定。
 *
 * 常规写法是在这里配好密钥和有效期：
 *
 * ```ts
 * JwtModule.register({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '15m' } })
 * ```
 *
 * 但本项目有**两套密钥**（Access 与 Refresh）。
 * 如果配了全局默认值，代码里就容易出现这种问题：
 * 签 Refresh Token 时忘了显式传 secret，于是用了 Access 的密钥 ——
 * 而**它不会报任何错**，双 Token 的保护却已经静默失效了。
 *
 * 传入空对象并不可疑：它只是说"我不提供默认值，
 * 每次签名时由调用方明确指定"。于是 `auth.service.ts` 里
 * 每一处 `signAsync` / `verifyAsync` 都显式写着用哪个密钥，
 * 一眼就能看出有没有用错。
 *
 * > 一般原则：**当存在多个同类配置时，宁可每次显式指定，
 * > 也不要给一个"默认的那个"** —— 因为默认值会让人不再思考。
 *
 * ## PassportModule 为什么也要 import
 *
 * `PassportStrategy` 依赖 Passport 的运行时环境。
 * 这里不调 `.register()` 是因为默认策略名已经够用
 * （我们在 `JwtStrategy` 上显式写了 `'jwt'`）。
 */
@Module({
  imports: [
    UsersModule,
    PassportModule,
    // 见上方注释：刻意留空，强制每次都显式指定密钥
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    /**
     * JwtStrategy 必须注册为 provider，Passport 才能找到它。
     * 忘了写它的表现是"所有需要登录的接口都 401"，
     * 而且日志里只会说 "Unknown authentication strategy"。
     */
    JwtStrategy,
  ],
  exports: [AuthService],
})
export class AuthModule {}
