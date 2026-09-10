import type { AuthResult, LoginPayload, PublicUser, RegisterPayload } from '@studyplan/shared'

/**
 * 登录态管理。
 *
 * ⚠️ 关于这里为什么**没有 import useApi**：
 *   `useApi` 在收到 401 时需要调用本文件的 `refresh()` 来续期，
 *   而本文件又需要用 `useApi` 发请求 —— 两者互相依赖。
 *   如果写成静态 import，就形成了循环依赖。
 *
 *   Nuxt 的自动导入让这两个函数在运行时是全局可用的，
 *   所以我们互相调用时**不需要写 import**，循环自然消失。
 *   这是一个真实的取舍：换来了依赖清晰，代价是"看不出它从哪来"。
 *   因此每个用到它的地方我都会在注释里点明。
 *
 * 分工说明：
 *   - Access Token  → 存在内存（useAccessToken），用于请求头
 *   - Refresh Token → 存在 httpOnly Cookie，**前端根本读不到**，
 *                     只由浏览器自动携带，前端只负责调用 /auth/refresh
 *   - 用户信息      → 存在 useState，用于界面显示（它不是敏感数据）
 */
export function useAuth() {
  const api = useApi()
  const token = useAccessToken()

  /** 当前用户。用 useState 是为了让页头等组件能响应式地拿到它 */
  const user = useState<PublicUser | null>('auth:user', () => null)

  /** 是否已经尝试过恢复登录态。避免多个组件重复触发 /auth/refresh */
  const ready = useState<boolean>('auth:ready', () => false)

  const isLoggedIn = computed(() => Boolean(user.value))

  function applySession(result: AuthResult): void {
    token.set(result.tokens.accessToken)
    user.value = result.user
    ready.value = true
  }

  function clearSession(): void {
    token.clear()
    user.value = null
    ready.value = true
  }

  async function register(payload: RegisterPayload): Promise<void> {
    applySession(await api.post<AuthResult>('/auth/register', payload))
  }

  async function login(payload: LoginPayload): Promise<void> {
    applySession(await api.post<AuthResult>('/auth/login', payload))
  }

  /**
   * 用 Refresh Cookie 换一套新 Token。
   *
   * 这是整个登录态能"长期有效"的关键：Access Token 只有 15 分钟，
   * 过期后不是让用户重新登录，而是悄悄拿 Cookie 去换一个新的。
   *
   * `skipAuthRetry: true` 是必须的 —— 否则这个请求自己收到 401 时
   * 会再次尝试刷新，形成无限递归。
   *
   * 失败时不抛错，而是返回 false 并清空登录态：
   * 调用方（useApi 的 401 处理）只关心"续期成不成功"，
   * 不需要处理异常。这让调用处少一层 try/catch。
   */
  async function refresh(): Promise<boolean> {
    try {
      const result = await api.post<AuthResult>('/auth/refresh', undefined, {
        skipAuthRetry: true,
      })
      applySession(result)
      return true
    } catch {
      clearSession()
      return false
    }
  }

  /**
   * 登出。
   *
   * 无论请求成功与否，都必须清本地状态 ——
   * 后端登出失败（比如网络抖动）不应该让用户"退不出去"。
   * 所以用了 finally 而不是把 clearSession 写在 try 里面。
   */
  async function logout(): Promise<void> {
    try {
      await api.post('/auth/logout', undefined, { skipAuthRetry: true })
    } finally {
      clearSession()
    }
  }

  /**
   * 应用启动时尝试恢复登录态。
   *
   * **只在浏览器里执行**：服务端渲染阶段既拿不到用户内存里的 Token，
   * 也不应该去动用用户的 Cookie（那会让服务端持有用户凭据）。
   *
   * 这就是为什么阶段 5 的界面会有极短的"未登录"闪现 ——
   * 服务端渲染时确实是未登录状态，客户端接管后才恢复。
   * 阶段 8 之前不需要优化它，但你要知道它为什么存在。
   */
  async function restore(): Promise<void> {
    if (ready.value) return

    if (import.meta.server) {
      // 服务端不参与登录态恢复，直接标记为"已就绪"，避免阻塞渲染
      ready.value = true
      return
    }

    await refresh()
  }

  return {
    user,
    ready,
    isLoggedIn,
    register,
    login,
    logout,
    refresh,
    restore,
  }
}
