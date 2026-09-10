import { expect, test as base } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * 端到端测试：新用户的完整旅程。
 *
 * ── 前置条件 ──
 *
 * E2E 跑的是**真实系统**，所以三样东西都必须在跑：
 *   1. MongoDB Atlas 可达（`apps/api/.env` 里的 MONGODB_URI 已填好）；
 *   2. 后端已启动：`pnpm dev:api`
 *   3. 前端已启动：`pnpm dev:web`
 *
 * 然后：`pnpm --filter @studyplan/web e2e`
 *
 * ── 为什么用随机邮箱？ ──
 *
 * 因为邮箱有唯一索引，写死一个邮箱的话，第二次跑就会因为
 * "邮箱已被注册"而失败 —— 于是你的 E2E 只有第一次是绿的。
 *
 * 用一个带时间戳的邮箱，让每次运行都是"一个全新用户"，
 * 测试因此可以**反复执行**。这是 E2E 最基本的要求：
 * **它必须是可重复的。** 不可重复的测试等于没有测试。
 */
const uniqueEmail = `e2e-${Date.now()}@example.com`
const password = 'e2e-password-12345'
const username = '端到端测试员'
const postTitle = `E2E 验证文章 ${Date.now()}`

/**
 * ════════════════════════════════════════════════════════════════
 *  共享会话 fixture —— 这一整段是本文件最值得读的部分
 * ════════════════════════════════════════════════════════════════
 *
 * ── 问题：Playwright 默认**为每个 test 新建一个浏览器上下文** ──
 *
 * "上下文隔离"意味着 Cookie、localStorage 全都**不共享**。
 * 平时这是好事：用例之间互不污染，可以随便并行。
 *
 * 但本项目的登录态长这样：
 *   · Access Token（15 分钟）→ 存在**浏览器内存**里
 *   · Refresh Token（7 天）  → 存在 **httpOnly Cookie** 里
 *
 * 于是"注册"用例拿到的 Cookie，到了下一个用例里根本不存在。
 * 实际表现极具误导性：
 *
 *   ✓ 「注册」用例通过 —— 因为全程客户端跳转，内存里的 Token 够用
 *   ✗ 「发帖」用例一 `page.goto()` 就跳回登录页
 *     （整页刷新 → 内存 Token 丢失 → 没有 Cookie 可换新的）
 *
 * ⚠️ **这个现象极易被误判成"应用的登录态有 bug"。**
 *    事实上应用是对的 —— 是测试没有模拟出"同一个用户、同一个浏览器"。
 *    判断依据是网络层证据：刷新请求确实发了，但**没带任何 Cookie**。
 *
 * ── 修法：定义一个 worker 作用域的 fixture ──
 *
 * `scope: 'worker'` 保证整个测试文件里**只创建一次** context 与 page，
 * 并且所有用例跑完后才关闭（`await use(page)` 之后的代码就是清理逻辑）。
 * 于是"同一个用户"这个前提被真正建立了。
 *
 * ── 顺带的好处 ──
 *
 * 改完之后，「发帖」用例里的 `page.goto('/posts/new')` 是一次
 * **真正的整页刷新** —— 内存里的 Access Token 会丢，必须靠 Cookie 换新的。
 * 也就是说，这套用例顺便把"刷新页面后仍保持登录"这条真实需求也验证了。
 * 这条路径**只有**共享上下文才测得到，单测和 mock 都覆盖不了。
 */
type WorkerFixtures = { session: Page }

const test = base.extend<Record<string, never>, WorkerFixtures>({
  session: [
    async ({ browser }, use) => {
      // 整个 worker 共用一个上下文，等价于"同一个用户一直开着同一个浏览器"
      const context = await browser.newContext()
      const page = await context.newPage()
      await use(page)
      await context.close()
    },
    { scope: 'worker' },
  ],
})

test.describe.configure({ mode: 'serial' })

test.describe('学习社区 · 核心旅程', () => {
  test('注册新账号后自动登录，并被带到首页', async ({ session: page }) => {
    await test.step('打开登录页并切到注册页签', async () => {
      await page.goto('/login')
      await expect(page.getByRole('heading', { name: '创建你的账号' })).toBeHidden()
      await page.getByRole('button', { name: '注册' }).first().click()
      await expect(page.getByRole('heading', { name: '创建你的账号' })).toBeVisible()
    })

    await test.step('填写并提交注册表单', async () => {
      await page.getByLabel('邮箱').fill(uniqueEmail)
      await page.getByLabel('用户名').fill(username)
      await page.getByLabel('密码').first().fill(password)
      await page.getByLabel('确认密码').fill(password)
      await page.getByRole('button', { name: '创建账号' }).click()
    })

    await test.step('注册成功：跳转首页，页头出现用户名', async () => {
      await page.waitForURL('/')
      await expect(page.getByText(username)).toBeVisible()
    })
  })

  test('发布一篇文章', async ({ session: page }) => {
    await page.goto('/posts/new')

    await test.step('填写标题、正文并选择标签', async () => {
      await page.getByLabel('标题').fill(postTitle)
      await page
        .getByLabel('正文（Markdown）')
        .fill('## 这是一篇端到端测试文章\n\n> 它由 Playwright 自动生成，用来验证发帖链路是通的。\n\n- 第一点\n- 第二点')

      // 至少选一个标签，否则前端会拦住提交
      await page.getByRole('button', { name: 'Nuxt', exact: true }).click()
    })

    await test.step('提交后跳转到详情页', async () => {
      await page.getByRole('button', { name: '发布文章' }).click()

      // 详情页的 URL 形如 /posts/<ObjectId>
      await page.waitForURL(/\/posts\/[a-f0-9]{24}$/, { timeout: 20_000 })
      await expect(page.getByRole('heading', { name: postTitle })).toBeVisible()
    })

    await test.step('正文的 Markdown 被正确渲染（而不是显示原始符号）', async () => {
      // 如果渲染失败，页面上会出现字面的 "##" 或 ">"
      await expect(page.locator('.prose-post h2')).toContainText('这是一篇端到端测试文章')
      await expect(page.locator('.prose-post blockquote')).toBeVisible()
    })
  })

  test('点赞：数字增加，再点一次减少', async ({ session: page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: new RegExp(postTitle) }).click()
    await page.waitForURL(/\/posts\/[a-f0-9]{24}$/)

    const likeButton = page.getByRole('button', { name: /点赞/ }).first()
    const before = Number((await likeButton.innerText()).trim())

    await likeButton.click()
    // 乐观更新会立刻改数字，随后的服务端响应再校正一次
    await expect
      .poll(async () => Number((await likeButton.innerText()).trim()), { timeout: 10_000 })
      .toBe(before + 1)

    await likeButton.click()
    await expect
      .poll(async () => Number((await likeButton.innerText()).trim()), { timeout: 10_000 })
      .toBe(before)
  })

  test('评论：发表后出现在列表里，并且能删除', async ({ session: page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: new RegExp(postTitle) }).click()
    await page.waitForURL(/\/posts\/[a-f0-9]{24}$/)

    const commentText = `这是自动化测试留下的评论 ${Date.now()}`

    await test.step('发表评论', async () => {
      await page.getByPlaceholder(/说说你的看法/).fill(commentText)
      await page.getByRole('button', { name: '发表评论' }).click()
      await expect(page.getByText(commentText)).toBeVisible()
    })

    await test.step('删除自己的评论', async () => {
      const comment = page.locator('article', { hasText: commentText })
      await comment.getByRole('button', { name: '删除这条评论' }).click()
      await expect(page.getByText(commentText)).toBeHidden()
    })
  })

  test('标签筛选：地址栏带上筛选条件，列表随之变化', async ({ session: page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Nuxt', exact: true }).click()

    // 筛选条件同步到地址栏 —— 这样结果可分享、可前进后退
    await expect(page).toHaveURL(/\?tag=Nuxt/)
    await expect(page.getByRole('heading', { name: postTitle })).toBeVisible()
  })

  test('未登录用户访问发帖页会被拦下（前端守卫 + 后端 401 双重保证）', async ({ browser }) => {
    // 用一个全新的上下文，等价于"一个从未登录过的浏览器"
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto('/posts/new')

    // 前端路由守卫会把未登录用户送到登录页，并带上回跳地址
    await expect(page).toHaveURL(/\/login\?redirect=/)

    await context.close()
  })
})
