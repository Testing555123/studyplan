/**
 * Access Token 的**内存**存储。
 *
 * ────────────────────────────────────────────────────────────────
 * 为什么不用 `useState` 或 Pinia？
 *
 * 因为这两个东西都会把状态**序列化进 SSR 的 HTML** ——
 * 也就是 `window.__NUXT__` 里会出现你的 Token。
 * 那和存 localStorage 的风险完全一样：同源下的任何脚本都能读到它。
 *
 * 所以这里用最"土"的方式：模块级变量。
 *   优点：只存在于 JS 运行时的内存里，刷新页面即消失，写不进任何地方；
 *   代价：刷新页面后需要靠 Refresh Token 重新换一个（这正是阶段 5 要做的事）。
 *
 * ────────────────────────────────────────────────────────────────
 * 为什么 set() 里有一行 `if (import.meta.server) return`？
 *
 * 模块级变量在服务端是**被所有请求共享**的！
 * 如果 SSR 期间写入了一个用户的 Token，下一个用户的请求就可能读到它 ——
 * 这是极其严重的数据串号。
 *
 * 我们的设计本来就不需要服务端持有 Token（登录和刷新都在浏览器里发生），
 * 所以直接用一行代码把这个不变量**强制**下来，
 * 而不是靠"记得不要在服务端调用它"这种口头约定。
 *
 * > 能用代码保证的事，不要交给注释和记忆。
 */
let accessToken: string | null = null

export function useAccessToken() {
  return {
    get: (): string | null => accessToken,

    set: (value: string | null): void => {
      // 见上文：服务端绝不持有 Token
      if (import.meta.server) return
      accessToken = value
    },

    clear: (): void => {
      accessToken = null
    },
  }
}
