/**
 * "当前登录用户"在后端内部的表示。
 *
 * 它和 `PublicUser`（接口契约）刻意不同：
 *   - `PublicUser` 是**要发给浏览器的**，所以带 createdAt、bio 这些展示字段；
 *   - `AuthenticatedUser` 是**从 Token 里解析出来的**，只有身份标识，
 *     不带任何展示信息。
 *
 * 为什么区分为两个类型？
 *   因为它们的来源不同、可信度不同。
 *   `AuthenticatedUser` 的内容来自**已签名并被验证过的 Token**，
 *   可以信任；而接口请求体里的任何字段都不能信任。
 *   把这两种东西用同一个类型表达，早晚会有人把请求体里的
 *   `username` 当成"已认证的用户名"来用。
 */
export interface AuthenticatedUser {
  id: string
  email: string
  username: string
}

/** Access Token 里承载的内容（JWT 的 payload） */
export interface AccessTokenPayload {
  /** 标准声明 subject，放用户 id */
  sub: string
  email: string
  username: string
}

/** Refresh Token 里承载的内容 */
export interface RefreshTokenPayload {
  sub: string
  /**
   * 显式标记 Token 类型。
   *
   * 这属于**纵深防御**：两种 Token 用的是不同的密钥，
   * 所以拿 Access Token 当 Refresh Token 用本来就验不过签名。
   * 但多加一个 type 字段，等于在"密钥不同"之外再加一层区分 ——
   * 万一将来有人图省事把两种 Token 改成同一个密钥，
   * 这一层还能拦住"拿 Access Token 换新 Token"这种提权尝试。
   */
  type: 'refresh'

  /**
   * Token 的唯一编号（标准声明 `jti`）。
   *
   * 为什么必须有它？这是本项目在写单测时**发现的一个真实缺陷**：
   *
   * JWT 的 `iat`（签发时间）**只有秒级精度**。如果两次签发
   * 发生在同一秒内、且载荷完全相同、密钥也相同，
   * 那么签出来的 Token **是一模一样的字符串**。
   *
   * 后果很直接：Refresh Token 轮换（rotation）在"同一秒内"
   * 是**完全无效**的 —— 用户拿旧 Token 换回来的还是旧 Token，
   * 一个被盗的 Token 不会因为真正用户刷新过一次而失效。
   *
   * 加上一个随机 uuid 之后，每次签发的 Token 都必然不同，
   * 轮换才真正成立。
   *
   * 顺带说：`jti` 也是"服务端记录已用 Token 以识别盗用"的基础 ——
   * 没有唯一编号，就无法区分"同一个 Token 被用了两次"。
   */
  jti: string
}
