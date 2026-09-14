/**
 * 登录守卫（路由中间件）。
 *
 * 用法：在页面里写 `definePageMeta({ middleware: 'auth' })`。
 *
 * ── 为什么它不是全局中间件？ ──
 * 因为绝大多数页面（帖子流、详情、登录页）本来就允许未登录访问。
 * 做成全局的话，每个页面都要写一个"白名单"来豁免自己，
 * 那既啰嗦又容易漏。**默认放行、按需拦截**更符合实际需求。
 *
 * ── 为什么服务端不做判断？ ──
 * 服务端渲染时，这个 Nuxt 服务器进程**不知道**当前浏览器内存里的
 * Access Token（那是浏览器 JS 的运行时状态）。
 * 它虽然能拿到 Refresh Cookie，但为了判断"能不能访问一个页面"
 * 就去动用用户凭据，是个不划算的取舍。
 *
 * 所以策略是：服务端先照常渲染（页面本身不依赖数据，所以不会出错），
 * 浏览器接管后立刻判断并跳转。
 *
 * ⚠️ 你要清楚这件事的**安全含义**：
 *   这只是**体验层**的拦截 —— 它拦住的是"用户点进了一个自己不能用的页面"。
 *   它**不是安全边界**。真正的安全边界在后端的 `@UseGuards(JwtAuthGuard)`：
 *   即使有人绕过前端直接发请求，后端照样会返回 401。
 *
 *   > 前端的权限控制永远是体验优化，不是安全措施。
 *   > 这一条会贯穿你整个职业生涯。
 */
/**
 * 一次会话只恢复一次登录态。
 *
 * ── 为什么需要它 ──
 * 这个中间件会在**每次**进入受保护页面时执行。原先每次都 `await auth.restore()`，
 * 而 `restore()` 要发一次 `/auth/refresh`（还要带 Cookie、查库、重签 token）。
 * 于是用户每点一次"写文章 → 返回 → 再进"，都要先干等一个网络往返，
 * 才看到页面 —— 表现为"点了没反应一下才跳转"，而其实什么都没坏。
 *
 * ── 为什么缓存的是 Promise 而不是布尔值 ──
 * 用 `let done = false` 会有竞态：第一次 restore 还在飞，
 * 第二次导航进来发现 `done === false`，于是又发一次，甚至可能在
 * 第一次返回之前就判成"未登录"而误跳登录页。
 * 缓存 Promise 之后，并发的导航会**等同一个结果**，既不会重复请求，
 * 也不会读到半截状态。
 */
let restorePromise: Promise<unknown> | null = null

export default defineNuxtRouteMiddleware(async (to) => {
  // 服务端不判断，交给客户端
  if (import.meta.server) return

  const auth = useAuth()

  // 已经登录（比如启动时的 auth-restore 插件已经恢复过了）就不必再问一次
  if (!auth.isLoggedIn.value) {
    // 可能是直接访问受保护页面（而不是从别的页面跳过来），
    // 此时内存里还没有 Token，先用 Refresh Cookie 尝试恢复一次
    restorePromise ??= auth.restore()
    await restorePromise
  }

  if (!auth.isLoggedIn.value) {
    /**
     * 把原本想去的地址带上，登录成功后可以直接跳回去。
     * 这是个小细节，但省掉的那次"再点一遍"体验差别很明显。
     *
     * 注意必须 encodeURIComponent：`?redirect=/posts/new?a=1`
     * 里的第二个 `?` 会把查询串截断，导致重定向失效。
     */
    return navigateTo({
      path: '/login',
      query: { redirect: to.fullPath },
    })
  }
})
