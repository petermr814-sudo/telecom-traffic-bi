import puppeteer from 'puppeteer-core'
const BASE = process.env.SHOT_BASE || 'http://127.0.0.1:5178/'

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-sandbox'],
  defaultViewport: { width: 1600, height: 1000 }
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const clickText = (text, sel = 'button') =>
  page.evaluate((t, s) => {
    const el = [...document.querySelectorAll(s)].find((x) => x.textContent.replace(/\s+/g, '').includes(t.replace(/\s+/g, '')))
    if (!el) throw new Error(`not found: ${t}`)
    el.click()
  }, text, sel)
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(ok ? 'PASS' : 'FAIL', name, detail)
}

// ---------- 时段分析：柱状 / 日均线 / 热力图 ----------
await page.goto(`${BASE}#/hourly`, { waitUntil: 'networkidle0' })
await sleep(1500)
await page.click('.day-button')
await sleep(900)
const seriesInfo = () => page.evaluate(() => {
  const c = document.querySelector('[data-chart="day-trend"] .chart-box').__chart
  const opt = c.getOption()
  return { types: opt.series.map((s) => s.type), markLine: Boolean(opt.series[0]?.markLine) }
})
check('默认柱状图', (await seriesInfo()).types[0] === 'bar')
await clickText('折线')
await sleep(400)
check('折线图可切换', (await seriesInfo()).types[0] === 'line')

await clickText('柱状')
await sleep(500)
let info = await seriesInfo()
check('柱状图可切换', info.types.includes('bar'), JSON.stringify(info))

await clickText('日均线')
await sleep(400)
info = await seriesInfo()
check('日均线可展开', info.markLine, JSON.stringify(info))
await clickText('日均线')
await sleep(300)
check('日均线可关闭', !(await seriesInfo()).markLine)

const heatInfo = () => page.evaluate(() => {
  const c = document.querySelector('[data-template="F10"] .chart-box').__chart
  const opt = c.getOption()
  const data = opt.series[0].data
  const values = data.map((d) => (Array.isArray(d) ? d[2] : d.value?.[2] ?? d.value))
  const days = {}
  for (const d of data) {
    const arr = Array.isArray(d) ? d : d.value
    days[arr[1]] = (days[arr[1]] || 0) + Number(arr[2])
  }
  return { max: Math.max(...values.map(Number)), maxDaySum: Math.max(...Object.values(days).map(Number)), vm: opt.visualMap?.[0]?.max }
})
await clickText('占当天')
await sleep(500)
const heat = await heatInfo()
check('热力图为百分比且单日不超 100%', heat.max < 100 && Math.abs(heat.maxDaySum - 100) < 1, JSON.stringify(heat))
check('热力图 visualMap 同步', Number(heat.vm) < 100, `vm=${heat.vm}`)

// ---------- 总览：对比 / 告警角标 / tooltip ----------
await page.goto(`${BASE}#/overview`, { waitUntil: 'networkidle0' })
await sleep(1400)
const seriesCount = () => page.evaluate(() => document.querySelector('.chart-box').__chart.getOption().series.length)
const c0 = await seriesCount()
await clickText('对比上期')
await sleep(400)
const c1 = await seriesCount()
check('对比开关真正增删曲线', c0 === 2 && c1 === 1, `${c0} -> ${c1}`)

const tooltipText = await page.evaluate(() => {
  const box = document.querySelector('.chart-box')
  const chart = box.__chart
  chart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: 12 })
  return new Promise((resolve) => setTimeout(() => {
    const divs = [...box.querySelectorAll('div')].map((d) => d.innerText).filter(Boolean)
    resolve(divs.sort((a, b) => b.length - a.length)[0] || '')
  }, 300))
})
check('折线图 hover 有数值', /\d/.test(tooltipText), tooltipText.replace(/\n/g, ' | ').slice(0, 80))

const badgeBefore = await page.evaluate(() => document.querySelector('.info-toggle__badge')?.textContent?.trim() || '0')
await page.evaluate(() => {
  if (!document.querySelector('.info-panel')) document.querySelector('.info-toggle').click()
})
await sleep(250)
await page.evaluate(() => {
  const row = [...document.querySelectorAll('.info-row')].find((el) => el.textContent.includes('待处理告警'))
  row?.click()
})
await sleep(700)
await clickText('全部确认')
await sleep(500)
const badgeAfter = await page.evaluate(() => document.querySelector('.info-toggle__badge')?.textContent?.trim() || '0')
check('告警角标随确认更新', Number(badgeBefore) > 0 && Number(badgeAfter) === 0, `${badgeBefore} -> ${badgeAfter}`)
await page.keyboard.press('Escape')
await sleep(300)

await page.evaluate(() => {
  if (!document.querySelector('.info-panel')) document.querySelector('.info-toggle').click()
})
await sleep(250)
await page.evaluate(() => {
  const row = [...document.querySelectorAll('.info-row')].find((el) => el.textContent.includes('刷新数据'))
  row?.click()
})
await sleep(700)
const badgeAfterRefresh = await page.evaluate(() => document.querySelector('.info-toggle__badge')?.textContent?.trim() || '0')
check('刷新后已确认告警不会被重置', Number(badgeAfterRefresh) === 0, `badge=${badgeAfterRefresh}`)

await page.hover('.kpi')
await sleep(350)
const kpiTransform = await page.evaluate(() => getComputedStyle(document.querySelector('.kpi')).transform)
check('指标卡悬停保持稳定', kpiTransform === 'none', kpiTransform)

// ---------- 区域：指标切换 ----------
await page.goto(`${BASE}#/region`, { waitUntil: 'networkidle0' })
await sleep(1600)
const mapData = () => page.evaluate(() => {
  return {
    sample: [...document.querySelectorAll('.city-row')].slice(0, 4).map(el => el.querySelector('.rank-value').textContent),
    metric: document.querySelector('.traffic-scene').dataset.metric
  }
})
const traffic = await mapData()
await clickText('用户')
await sleep(500)
const users = await mapData()
check('地图指标真正切换', JSON.stringify(traffic.sample) !== JSON.stringify(users.sample), `traffic=${JSON.stringify(traffic.sample)} users=${JSON.stringify(users.sample)}`)

await page.goto(`${BASE}#/cells`, { waitUntil: 'networkidle0' })
await sleep(1200)
check('非对比页隐藏对比按钮', !(await page.$('.compare-btn')))

await page.goto(`${BASE}#/hourly`, { waitUntil: 'networkidle0' })
await sleep(1600)
await page.click('.day-button')
await sleep(900)
const hourlyTip = await page.evaluate(() => {
  const box = document.querySelector('[data-chart="day-trend"] .chart-box')
  box.__chart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: 12 })
  return new Promise((resolve) => setTimeout(() => resolve(box.innerText.slice(0, 80)), 350))
})
check('当天图表 hover 有数值', /当天/.test(hourlyTip) && /\d/.test(hourlyTip), hourlyTip.replace(/\n/g, ' | '))

await page.goto(`${BASE}#/realtime`, { waitUntil: 'networkidle0' })
await sleep(1400)
const live1 = await page.evaluate(() => document.querySelector('.chart-box').__chart.getOption().series[0].data.at(-1))
await sleep(2600)
const live2 = await page.evaluate(() => document.querySelector('.chart-box').__chart.getOption().series[0].data.at(-1))
check('实时曲线持续刷新', live1 !== live2, `${live1} -> ${live2}`)

// ---------- 侧栏精简：无折叠入口 / 连接状态 / 账户区 ----------
const sidebarLegacy = await page.evaluate(() => ({
  collapseBtn: Boolean(document.querySelector('.collapse-btn')),
  collapseRow: Boolean(document.querySelector('.collapse-row')),
  connCard: Boolean(document.querySelector('.conn-card')),
  userBlock: Boolean(document.querySelector('.sidebar-foot .user')),
  brand: document.querySelector('.brand-text strong')?.textContent?.trim() ?? ''
}))
check('侧栏已移除折叠/连接状态/账户区', !sidebarLegacy.collapseBtn && !sidebarLegacy.collapseRow && !sidebarLegacy.connCard && !sidebarLegacy.userBlock, sidebarLegacy)
check('品牌字标保留', sidebarLegacy.brand === 'TeleScope', sidebarLegacy.brand)

console.log('\nERRORS:', errors.length, errors.slice(0, 4))
const failed = results.filter((r) => !r.ok)
console.log(`SUMMARY: ${results.length - failed.length}/${results.length} passed`)
await browser.close()
process.exit(failed.length ? 2 : 0)
