import { expect, test } from '@playwright/test'

/**
 * 语义搜索 / 问全书的端到端用例。
 *
 * ── 前置条件（与 studyplan.spec.ts 相同）──
 *   1. MongoDB Atlas 可达；2. `pnpm dev:api`；3. `pnpm dev:web`。
 *
 * 用例刻意不依赖"库里恰好有什么帖子"：只验结构、门槛与参数校验。
 * 数据相关的验收（语义泛化召回）属于人工标准，列在计划 Task 11 Step 4 清单。
 */
test.describe('语义搜索页', () => {
  test('页面可达，双 Tab 渲染', async ({ page }) => {
    await page.goto('/search')
    await expect(page.getByRole('heading', { name: '智能搜索' })).toBeVisible()
    await expect(page.getByRole('tab', { name: '问全书' })).toBeVisible()
  })

  test('侧栏入口可到达 /search', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /智能搜索/ }).first().click()
    await expect(page).toHaveURL(/\/search/)
  })

  test('未登录时问全书显示登录引导而非输入框', async ({ page }) => {
    await page.goto('/search?mode=ask')
    await expect(page.getByText('「问全书」需要登录后使用')).toBeVisible()
    await expect(page.getByPlaceholder(/问一个站内帖子能回答的问题/)).toHaveCount(0)
  })

  test('未登录直连 API 被 401 拦截（验收 #3 的绕过 UI 路径）', async ({ request }) => {
    const res = await request.post('/api/search/ask', { data: { question: '测试' } })
    expect(res.status()).toBe(401)
  })

  test('纯空白查询返回 400（Review Focus #1 的端到端复验）', async ({ request }) => {
    const res = await request.post('/api/search/semantic', { data: { query: '   ' } })
    expect(res.status()).toBe(400)
  })
})
