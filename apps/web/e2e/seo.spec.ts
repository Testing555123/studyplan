import { expect, test, type Page } from '@playwright/test'

/**
 * SEO 基础设施的回归用例。
 *
 * ── 为什么值得专门一组用例 ──
 * SEO 的失败方式**极其安静**：meta 标签少了一个、canonical 变成相对路径、
 * sitemap 返回 200 但内容为空 —— 页面照常打开、功能照常能用、
 * 控制台一条报错都没有。等发现的时候，往往已经是"收录掉了几个月"。
 * 所以这类能力必须靠测试钉住，靠"上线时看一眼"是守不住的。
 *
 * ── 与其它 E2E 的分工 ──
 * 既有 6 条用例守"用户能不能用"，这一组守"机器能不能读懂"。
 * 两者互不替代。
 */

/**
 * 断言一页有合法的 canonical 与基本 OG 标签。
 *
 * canonical 的两个判定点缺一不可：
 *   · 是**绝对 URL**（带协议与域名）—— 相对路径会被搜索引擎忽略；
 *   · pathname 与当前页面一致 —— 指向别处等于告诉搜索引擎"这页不是原创"。
 */
async function assertCanonicalAndOg(page: Page, expectedPath: string): Promise<void> {
  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href')
  expect(canonical, '页面必须有 link[rel=canonical]').toBeTruthy()

  const parsed = new URL(canonical ?? '')
  expect(parsed.protocol).toMatch(/^https?:$/)
  expect(parsed.pathname, 'canonical 必须指向页面自身').toBe(expectedPath)

  expect(await page.locator('meta[property="og:title"]').count()).toBeGreaterThan(0)
  expect(await page.locator('meta[property="og:image"]').count()).toBeGreaterThan(0)
}

test.describe('SEO 基础设施', () => {
  test('首页：canonical 为绝对 URL 且带 OG 与封面图', async ({ page }) => {
    await page.goto('/')

    await assertCanonicalAndOg(page, '/')

    // 封面必须是绝对地址 —— 相对路径的 og:image 在多数社交平台上不生效
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content')
    expect(ogImage).toContain('/og-cover.jpg')
    expect(ogImage).toMatch(/^https?:\/\//)
  })

  test('robots.txt 可访问，且声明了 sitemap', async ({ request }) => {
    const response = await request.get('/robots.txt')

    expect(response.status()).toBe(200)

    const body = await response.text()
    expect(body).toContain('User-agent')
    // robots.txt 规范要求 Sitemap 必须是绝对 URL，相对路径会被忽略
    expect(body).toMatch(/^Sitemap:\s+https?:\/\//m)
  })

  test('sitemap.xml 返回 200、是 XML、且至少包含站点自身', async ({ request }) => {
    const response = await request.get('/sitemap.xml')

    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('xml')

    const body = await response.text()
    expect(body).toContain('<urlset')
    expect(body).toContain('<loc>')

    // 每个 <loc> 都必须是绝对 URL（以 http 开头）——
    // sitemap 规范要求绝对地址，相对路径会被搜索引擎整条忽略
    expect(body).toContain('<loc>http')
  })

  /**
   * 这一条是**专门为已经发生过的一次线上事故**写的。
   *
   * 事故经过：sitemap 内部拉取帖子时没有解包后端的统一响应壳
   * （`{ statusCode, data, requestId, timestamp }`），
   * 于是 `result.items` 是 undefined，`for...of` 抛错掉进降级分支 ——
   * 结果 sitemap 一直是 200、格式合法、**但永远只有静态路由**。
   * 不报错、不告警、页面照常打开，只有真的去看内容才发现。
   *
   * 而当时的用例里有 `test.skip(!matched, '没有帖子可验证')` ——
   * 那条"善意的跳过"正好把它放过去了。
   * 教训：**能跳过的关键断言，等于没有断言。**
   *
   * 所以这里不写死数量，而是用接口返回的 total 做对照 ——
   * 数据库有多少篇，sitemap 就必须收录多少条。
   */
  test('sitemap 收录的帖子数与接口返回的 total 一致', async ({ request }) => {
    const api = await request.get('/api/posts?page=1&pageSize=100')
    expect(api.status()).toBe(200)

    const payload = (await api.json()) as { data?: { total?: number } }
    const total = payload?.data?.total ?? 0

    const sitemap = await (await request.get('/sitemap.xml')).text()
    const postLocs = [...sitemap.matchAll(/\/posts\/([^<]+)<\/loc>/g)].map((m) => m[1])

    expect(
      postLocs.length,
      `数据库有 ${total} 篇帖子，sitemap 必须收录同样多条`,
    ).toBe(total)
  })

  test('帖子详情页：canonical 指向自身，og:title 是帖子标题而非站点默认值', async ({ request, page }) => {
    /**
     * 从 sitemap 里现拿一个真实帖子 URL，而不是写死 id：
     * id 随数据变化，写死的后果是"换个环境就 404"，
     * 看起来像测试坏了，其实是数据变了。
     */
    const sitemap = await (await request.get('/sitemap.xml')).text()
    const matched = sitemap.match(/<loc>(https?:\/\/[^<]*\/posts\/[^<]+)<\/loc>/)
    test.skip(!matched, '当前没有任何帖子可验证（sitemap 中没有文章 URL）')
    if (!matched) return

    const postUrl = matched[1]
    await page.goto(postUrl)

    await assertCanonicalAndOg(page, new URL(postUrl).pathname)

    /**
     * 关键断言：详情页的 og:title **必须被页面覆盖**。
     * 如果它等于站点默认值，说明覆盖没生效 ——
     * 用户把链接分享出去时，卡片上永远是站点名而不是文章标题。
     */
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content')
    expect(ogTitle).toBeTruthy()
    expect(ogTitle).not.toBe('studyplan · 学习社区')
  })
})
