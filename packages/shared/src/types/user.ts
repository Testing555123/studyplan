/**
 * 用户相关的契约类型。
 *
 * 命名约定：
 *   - `PublicUser` 表示"可以安全返回给浏览器"的用户信息，**永远不含密码哈希**。
 *     后端从 MongoDB 取出的 User 文档包含 passwordHash，必须先经过显式转换
 *     才能变成 PublicUser —— 这一步是防"密码哈希泄漏到前端"的关键闸门。
 */
export interface PublicUser {
  id: string
  email: string
  username: string
  /** 没有头像上传功能，用"生成式头像底色"代替，由用户名哈希稳定算出 */
  avatarColor: string
  bio?: string
  createdAt: string
}

/** 注册入参 */
export interface RegisterPayload {
  email: string
  username: string
  password: string
}

/** 登录入参 */
export interface LoginPayload {
  email: string
  password: string
}

/**
 * 登录成功后返回的令牌信息。
 * 注意：真正的 Refresh Token **不在**这个对象里 —— 它由后端写入
 * httpOnly Cookie，JavaScript 读不到，所以这里也不需要它的字段。
 */
export interface AuthTokens {
  accessToken: string
  /** Access Token 的有效秒数，前端据此做静默刷新 */
  expiresIn: number
}

export interface AuthResult {
  user: PublicUser
  tokens: AuthTokens
}
