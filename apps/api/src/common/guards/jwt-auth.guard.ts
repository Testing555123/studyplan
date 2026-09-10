import { Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

/**
 * 登录守卫。
 *
 * 用法：在需要登录的接口（或整个 Controller）上加 `@UseGuards(JwtAuthGuard)`。
 *
 * 它的实现只有一行 —— 真正的工作都由 `JwtStrategy` 完成。
 * 这是 Passport 的设计：**守卫只负责"拦"，策略负责"验"**。
 *
 * 为什么不用写任何逻辑？
 *   因为 `AuthGuard('jwt')` 这个名字就是"请使用名为 jwt 的策略"。
 *   而我们注册策略时用的正是这个名字：
 *   `class JwtStrategy extends PassportStrategy(Strategy, 'jwt')`。
 *   **这两个字符串必须一致**，不一致的表现是"所有请求都 401"，
 *   而报错信息只会说 "Unknown authentication strategy"，不会告诉你
 *   是哪里写错了名字。
 *
 * 失败时会自动抛 401 Unauthorized（而不是 403）：
 *   401 = "我不知道你是谁"（没登录、Token 无效）
 *   403 = "我知道你是谁，但你没权限"
 *   这两个语义不能混用，否则前端的"Token 过期就刷新"逻辑就无从下手。
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
