const { chromium } = require('@playwright/test')

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1080, height: 900 } })
  await page.goto('http://localhost:3001/trending', { waitUntil: 'networkidle' })

  const digestCard = page.locator('div.my-4').filter({ hasText: '每日 GitHub 项目报道' }).first()
  const db = await digestCard.boundingBox()

  // 报导卡之后到网格之间，究竟有哪些兄弟元素
  const siblings = await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('div.my-4')).find((d) =>
      d.textContent.includes('每日 GitHub 项目报道'),
    )
    if (!card) return 'card not found'
    const out = []
    let el = card.nextElementSibling
    let i = 0
    while (el && i < 4) {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      out.push({
        tag: el.tagName,
        cls: (el.className || '').toString().slice(0, 60),
        top: Math.round(r.top),
        marginTop: cs.marginTop,
        paddingTop: cs.paddingTop,
      })
      el = el.nextElementSibling
      i++
    }
    return out
  })
  console.log('digest bottom:', Math.round(db.y + db.height))
  console.log('following siblings:', JSON.stringify(siblings, null, 2))

  const grid = page.locator('div.grid').first()
  if (await grid.count()) {
    const gb = await grid.boundingBox()
    console.log('grid top:', Math.round(gb.y), '| gap from digest:', Math.round(gb.y - (db.y + db.height)))
    console.log('grid class:', (await grid.getAttribute('class')).slice(0, 80))
  }

  await browser.close()
}

main().catch((e) => {
  console.log('ERR', e.message)
  process.exit(0)
})
