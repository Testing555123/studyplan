import { expect, test } from '@playwright/test'

/**
 * T15 端到端冒烟：覆盖首页 / 电子书 / AI 助手页面可达，以及 /api/health 端点形态。
 * health 断言对 DB 可用性保持宽容（ok|degraded 均可），确保本地与容器（V6）命中同一端点形态。
 */

test('首页可达', async ({ page }) => {
  const res = await page.goto('/')
  expect(res?.status()).toBeLessThan(400)
  await expect(page.locator('body')).toBeVisible()
})

test('电子书索引可达', async ({ page }) => {
  const res = await page.goto('/ebook')
  expect(res?.status()).toBeLessThan(400)
})

test('AI 助手页面可达', async ({ page }) => {
  const res = await page.goto('/ai')
  expect(res?.status()).toBeLessThan(400)
})

test('/api/health 返回约定的 status/database 形态', async ({ request }) => {
  const res = await request.get('/api/health')
  expect([200, 503]).toContain(res.status())
  const body = await res.json()
  expect(['ok', 'degraded']).toContain(body.status)
  expect(['connected', 'disconnected']).toContain(body.database)
})
