async function main() {
  // 1. 趋势页：筛选面板
  const t = await (await fetch('http://localhost:3001/trending')).text()
  const panelIdx = t.indexOf('glass-panel')
  const panelStart = t.lastIndexOf('<div', panelIdx)
  const panelTag = t.slice(panelStart, t.indexOf('>', panelIdx) + 1)
  const panelCls = (panelTag.match(/class="([^"]*)"/) || [])[1] || ''
  console.log('[筛选面板] classes:', panelCls)
  console.log('[筛选面板] p-5:', /\bp-5\b/.test(panelCls), '| mb-4:', /\bmb-4\b/.test(panelCls))

  // 2. 趋势页：项目卡内距
  const cardIdx = t.indexOf('rounded-3xl')
  const seg = t.slice(Math.max(0, cardIdx - 500), cardIdx + 300)
  const cardCls = (seg.match(/class="([^"]*rounded-3xl[^"]*)"/) || [])[1] || ''
  console.log('[项目卡] p-5:', /\bp-5\b/.test(cardCls))

  // 3. 贴文页：筛选条 md:p-5
  const p = await (await fetch('http://localhost:3001/posts')).text()
  const cfIdx = p.indexOf('card-surface')
  const cfStart = p.lastIndexOf('<div', cfIdx)
  const cfTag = p.slice(cfStart, p.indexOf('>', cfIdx) + 1)
  console.log('[贴文页筛选条] classes:', (cfTag.match(/class="([^"]*)"/) || [])[1] || '')
  console.log('[贴文页筛选条] md:p-5:', cfTag.includes('md:p-5'))
}

main().catch((e) => console.log('ERR', e.message))
