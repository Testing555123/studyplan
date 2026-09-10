import type { ApiErrorBody } from '@studyplan/shared'

/**
 * 统一请求错误。
 *
 * 为什么要把错误包成自己的类，而不是直接用 `$fetch` 抛出来的？
 *   因为 ofetch 抛出的 `FetchError` 形状很"底层"：状态码藏在
 *   `error.response.status`，响应体藏在 `error.response._data`。
 *   如果每个调用处都去解这层结构，你会在十个地方写同样的代码，
 *   而且总有几个地方忘了判断 `response` 是否存在（网络层失败时它就没有）。
 *
 * 包一层之后，调用方只需要认识三个东西：statusCode、message、details。
 */
export class ApiRequestError extends Error {
  readonly statusCode: number
  readonly details?: string[]
  readonly path?: string

  constructor(body: ApiErrorBody) {
    super(body.message)
    this.name = 'ApiRequestError'
    this.statusCode = body.statusCode
    this.details = body.details
    this.path = body.path
  }

  /**
   * 是否是"根本没连上"（后端没启动、断网）。
   *
   * statusCode 为 0 是在 toApiRequestError 里约定的：
   * 只有拿到了 HTTP 响应才会有真实状态码，一个都没有就说明
   * 请求压根没走通。区分这一种情况非常重要 ——
   * "后端没启动"和"后端返回了 500"给用户的提示完全不同。
   */
  get isNetworkError(): boolean {
    return this.statusCode === 0
  }
}

/** 判断一个值是不是后端约定的错误体形状 */
function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === 'object' && value !== null && 'statusCode' in value && 'message' in value
}

/** 把各种形态的错误统一成 ApiRequestError */
function toApiRequestError(error: unknown): ApiRequestError {
  if (error instanceof ApiRequestError) return error

  const candidate = error as {
    response?: { status?: number; _data?: unknown }
    statusCode?: number
    data?: unknown
    message?: string
  }

  /**
   * ofetch 会把已经解析好的响应体放在 `response._data` 里。
   * 这个下划线前缀很反直觉，是联调时最常浪费时间的细节之一。
   *
   * 如果后端的异常过滤器正常工作，这里拿到的就是标准的 ApiErrorBody；
   * 但如果错误发生在到达后端之前（比如 CORS 被拦），
   * `_data` 就会是 undefined —— 所以我们还得有兜底分支。
   */
  const body = candidate?.response?._data ?? candidate?.data
  if (isApiErrorBody(body)) return new ApiRequestError(body)

  const status = candidate?.response?.status ?? candidate?.statusCode ?? 0

  return new ApiRequestError({
    statusCode: status,
    message:
      status === 0
        ? '无法连接到后端服务，请确认它已启动（pnpm dev:api）'
        : (candidate?.message ?? '请求失败，请稍后重试'),
  })
}

/** 本项目用到的请求选项。刻意只开放这几个 —— 少即是清晰。 */
interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  query?: Record<string, unknown>
  body?: unknown
  headers?: Record<string, string>
  /**
   * 跳过 401 自动续期。
   *
   * 只有认证相关的接口（登录、刷新、登出）需要它 ——
   * 否则"刷新令牌的请求自己收到 401"会再次触发刷新，无限递归。
   */
  skipAuthRetry?: boolean
}

/**
 * 统一的接口调用入口。
 *
 * 它统一了五件事，每一件都是"不封装的代价"：
 *   1. **基地址**：来自 runtimeConfig，可用环境变量覆盖 ——
 *      阶段 8 部署时不用改代码，只改一个环境变量；
 *   2. **鉴权头**：自动带上内存里的 Access Token；
 *   3. **401 静默续期**：过期时用 Refresh Cookie 换新 Token 并重试原请求，
 *      用户完全无感；
 *   4. **错误归一化**：任何失败都变成 ApiRequestError；
 *   5. **SSR 的 Cookie 转发**：见下方注释。
 *
 * ⚠️ 它必须在 Nuxt 上下文里调用（组件 setup、store setup、插件中）。
 *    因为它内部要用 useRuntimeConfig() 和 useRequestHeaders()。
 */
export function useApi() {
  const { public: runtimePublic } = useRuntimeConfig()
  const baseURL = runtimePublic.apiBase as string

  /**
   * @param allowRetry 内部参数：标记"这次请求是否还允许在 401 时重试"。
   *   重试时会传 false，确保**每个请求最多只重试一次**。
   *   没有这个开关，一个持续 401 的接口会让前端反复刷新令牌。
   */
  async function request<T>(
    path: string,
    options: ApiRequestOptions = {},
    allowRetry = true,
  ): Promise<T> {
    // 见 useAuth.ts 顶部注释：这里靠 Nuxt 自动导入拿到，无需 import
    const token = useAccessToken()

    const { method = 'GET', query, body, headers, skipAuthRetry } = options

    const finalHeaders: Record<string, string> = { ...headers }

    // ① 带上 Access Token（如果内存里有的话）
    const accessToken = token.get()
    if (accessToken) {
      finalHeaders.Authorization = `Bearer ${accessToken}`
    }

    /**
     * ② 服务端渲染时，把浏览器发来的 Cookie 转发给后端。
     *
     * 为什么需要这一步？
     *   因为 SSR 期间是 **Nuxt 服务器**在向后端发请求，
     *   而不是浏览器。浏览器上那个 httpOnly 的 Refresh Cookie
     *   不会自动出现在服务器发起的请求里。
     *
     *   不转发的话，SSR 渲染出来的永远是"未登录"状态，
     *   到了浏览器再闪一下变成已登录 —— 体验很差。
     *
     *   注意我们**只转发，不保存**：Token 依然只存在于这一次请求的
     *   生命周期内，服务端不会把它存到任何变量里。
     */
    if (import.meta.server) {
      const cookie = useRequestHeaders(['cookie']).cookie
      if (cookie) finalHeaders.cookie = cookie
    }

    try {
      return await $fetch<T>(path, {
        baseURL,
        method,
        /**
         * credentials: 'include' 让浏览器在跨域请求时
         * **携带并接受** Cookie。没有它，Refresh Cookie 根本不会发出去，
         * 表现就是"登录成功了，但一刷新页面就变回未登录"。
         */
        credentials: 'include',
        headers: finalHeaders,
        ...(query ? { query } : {}),
        ...(body !== undefined ? { body } : {}),
      })
    } catch (error) {
      const apiError = toApiRequestError(error)

      /**
       * ③ 401 静默续期。
       *
       * 401 的含义是"我不知道你是谁" —— 最可能的原因就是
       * Access Token 过期了（它只有 15 分钟）。此时用 Refresh Cookie
       * 换一个新的，然后**把原请求重放一次**。
       *
       * 用户视角：什么都没有发生。
       * 如果没有这段逻辑，用户会每 15 分钟被踢回登录页一次，
       * 而且是在他刚点下"发布"的那一刻。
       */
      if (apiError.statusCode === 401 && allowRetry && !skipAuthRetry) {
        // 见 useAuth.ts：靠自动导入拿到，无需 import
        const refreshed = await useAuth().refresh()
        if (refreshed) {
          // allowRetry = false，保证只重试一次
          return await request<T>(path, options, false)
        }
      }

      throw apiError
    }
  }

  /**
   * 后四个方法只是给 request 加了一层"人类友好的签名"：
   * `api.get('/posts', { page: 1 })` 比
   * `request('/posts', { method: 'GET', query: { page: 1 } })` 好读得多。
   */
  return {
    baseURL,

    request,

    get: <T>(path: string, query?: Record<string, unknown>, options?: ApiRequestOptions) =>
      request<T>(path, { ...options, method: 'GET', query }),

    post: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
      request<T>(path, { ...options, method: 'POST', body }),

    /**
     * PUT 用于**幂等**操作（比如点赞）：
     * 调用一次和调用十次结果相同，所以重试是安全的。
     * 这也是点赞接口不用 POST 切换的原因 —— 见后端 likes.service.ts。
     */
    put: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
      request<T>(path, { ...options, method: 'PUT', body }),

    patch: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
      request<T>(path, { ...options, method: 'PATCH', body }),

    /** 删除接口返回 204，没有响应体，所以默认泛型是 void */
    remove: <T = void>(path: string, options?: ApiRequestOptions) =>
      request<T>(path, { ...options, method: 'DELETE' }),
  }
}
