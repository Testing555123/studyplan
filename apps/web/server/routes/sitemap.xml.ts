import { MAX_PAGE_SIZE, type ApiSuccessBody, type PostListResponse } from '@studyplan/shared'

/**
 * 动态 sitemap.xml。
 *
 * ── 为什么自己写而不装 `@nuxtjs/sitemap` ──
 * 这个站只有 3 个静态页面 + 1 类动态 URL，自己写大约 30 行；
 * 装模块则要多一层配置、多一个升级负担，换来的能力我们用不上。
 * 本仓库反复强调"最少技术栈"，这里正是该原则的用武之地。
 *
 * ── 为什么取数走 apiBaseInternal（回环地址）──
 * 与 `useApi.ts` 的 SSR 分支同一约定：请求发生在容器内部，
 * 走 127.0.0.1 不用付 DNS + TLS + 跨境 RTT。
 * 绕公网等于每次搜索引擎来抓 sitemap，都让它替我们跑一趟太平洋。
 *
 * ── ⚠️ 失败必须降级而不是报错 ──
 * 数据库抖一下就让 sitemap 返回 500，搜索引擎会降低抓取频率 ——
 * 那是比"少几条 URL"严重得多的长期伤害。
 * 所以取数失败时只输出静态路由，状态码仍是 200。
 */

/** XML 里的五个保留字符。路径目前只会是安全字符，但这层是**防御**：
 *  将来 URL 里若出现用户可控片段（比如帖子标题），不加它就是注入点。 */
function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const siteOrigin = String(config.public.siteUrl).replace(/\/+$/, '')

  /**
   * 只列"值得被搜索"的页面。
   * `/login` 与 `/posts/new`（还要求登录）是工具页 ——
   * 把它们塞进 sitemap 只会稀释抓取预算，不会带来任何流量。
   */
  const paths: string[] = ['/', '/trending', '/roadmap']

  try {
    /**
     * ⚠️ 必须用 `ApiSuccessBody<T>` 而不是裸的 `PostListResponse`。
     *
     * 后端有一个全局 TransformInterceptor，会把**所有**成功响应
     * 包成 `{ statusCode, data, requestId, timestamp }`。
     * 直接按 `PostListResponse` 去读 `result.items` 会得到 `undefined`，
     * 然后 `for...of` 抛 TypeError 掉进下面的 catch ——
     * 表现是"sitemap 永远是 200，但只有静态路由"，不报错、不告警，
     * 非常安静。这个坑正是靠线上验证才暴露出来的：
     * 本地因为数据库连不上，一直在走降级路径，把它完全掩盖了。
     */
    const result = await $fetch<ApiSuccessBody<PostListResponse>>('/posts', {
      baseURL: String(config.apiBaseInternal),
      // 用共享包里的上限，而不是自己猜一个数字 ——
      // 后端调小上限时这里会跟着变，不会悄悄开始 400
      query: { page: 1, pageSize: MAX_PAGE_SIZE },
      timeout: 5000,
    })

    for (const post of result.data?.items ?? []) {
      paths.push(`/posts/${post.id}`)
    }
  } catch (error) {
    /**
     * 降级：只保留静态路由，状态码仍是 200。
     *
     * ⚠️ 但**必须记一条 warn**，不能静默。
     * 静默的后果这次已经付过学费了：sitemap 长期只输出静态路由、
     * 不报错、不告警，直到有人真的去看内容才发现。
     * 降级本身是对的，"降级时不留痕迹"是错的。
     */
    console.warn('[sitemap] 拉取帖子失败，已降级为只输出静态路由：', error)
  }

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  /**
   * 缓存 1 小时：sitemap 的更新频率远低于此，
   * 而每次抓取都回源查一遍库，等于给最忙的接口再加一个免费访客。
   */
  setHeader(event, 'cache-control', 'public, max-age=3600')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((path) => `  <url><loc>${siteOrigin}${escapeXml(path)}</loc></url>`).join('\n')}
</urlset>`
})
