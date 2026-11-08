import puppeteer from 'puppeteer-core'

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
const text = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? '', sel)
const exists = (sel) => page.evaluate((s) => Boolean(document.querySelector(s)), sel)

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(ok ? 'PASS' : 'FAIL', name, detail)
}

await page.goto('http://127.0.0.1:5178/#/overview', { waitUntil: 'networkidle0' })
await sleep(1200)
const kpi0 = await text('.kpi-value')
await clickText('近7天')
await sleep(900)
const kpi1 = await text('.kpi-value')
check('时间范围切换改变总流量', kpi0 !== kpi1, `${kpi0} -> ${kpi1}`)

await page.click('.region-btn')
await sleep(200)
await page.evaluate(() => {
  const items = [...document.querySelectorAll('.dd-menu--region .dd-item')]
  items.find((x) => x.textContent.includes('华东'))?.click()
})
await sleep(900)
const kpi2 = await text('.kpi-value')
check('区域筛选改变总流量', kpi1 !== kpi2, `${kpi1} -> ${kpi2}`)
check('区域按钮显示华东', (await text('.region-label')) === '华东')

await page.click('.compare-btn')
const compareOn = await page.evaluate(() => document.querySelector('.compare-btn')?.classList.contains('is-on'))
check('对比开关可切换', !compareOn)

await page.click('.bell')
await sleep(500)
check('告警抽屉打开', await exists('.drawer'))
await clickText('全部确认')
await sleep(300)
const ackToast = await exists('.toast--success')
check('告警可批量确认', ackToast)
await page.keyboard.press('Escape')
await sleep(300)

await page.keyboard.down('Control')
await page.keyboard.press('KeyK')
await page.keyboard.up('Control')
await sleep(300)
check('命令面板打开', await exists('.palette'))
await page.keyboard.type('资源')
await sleep(200)
await page.keyboard.press('Enter')
await sleep(900)
check('命令面板跳转资源页', (await page.evaluate(() => location.hash)) === '#/cells')

const rowCountBefore = await page.evaluate(() => document.querySelectorAll('.table tbody tr').length)
await clickText('预警小区')
await sleep(500)
const statuses = await page.evaluate(() =>
  [...document.querySelectorAll('.table tbody tr .chip')].map((x) => x.textContent.trim()).filter((x) => x.includes('预警') || x.includes('拥塞'))
)
check('预警卡片筛选生效', statuses.length > 0 && statuses.every((s) => s === '预警'), `${rowCountBefore} rows -> ${statuses.length} warning`)

await clickText('生成扩容建议')
await sleep(400)
check('扩容建议弹窗打开', await exists('.modal'))
await clickText('下发工单')
await sleep(400)
check('工单下发提示', await exists('.toast--success'))

await page.goto('http://127.0.0.1:5178/#/realtime', { waitUntil: 'networkidle0' })
await sleep(900)
const consumersBefore = await page.evaluate(() => document.querySelectorAll('.consumer').length)
await clickText('模拟缩容')
await sleep(400)
const consumersAfter = await page.evaluate(() => document.querySelectorAll('.consumer').length)
check('模拟消费者缩容', consumersBefore === 3 && consumersAfter === 2, `${consumersBefore} -> ${consumersAfter}`)
await clickText('暂停')
const playBtn = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('继续')))
check('实时流可暂停', playBtn)

await page.goto('http://127.0.0.1:5178/#/pipeline', { waitUntil: 'networkidle0' })
await sleep(700)
await clickText('重跑失败')
await sleep(2500)
const runningToast = await page.evaluate(() => [...document.querySelectorAll('.toast')].length)
check('作业重跑有反馈', runningToast > 0)

await page.goto('http://127.0.0.1:5178/#/overview', { waitUntil: 'networkidle0' })
await sleep(900)
await page.click('.conn-btn')
await sleep(300)
check('设置弹窗打开', await exists('.modal'))
await page.evaluate(() => {
  const input = document.querySelectorAll('.modal input[type=number]')[0]
  input.value = '60'
  input.dispatchEvent(new Event('input', { bubbles: true }))
})
await clickText('保存设置')
await sleep(400)
check('阈值保存提示', await exists('.toast--success'))

console.log('\nERRORS:', errors.length, errors.slice(0, 5))
const failed = results.filter((r) => !r.ok)
console.log(`SUMMARY: ${results.length - failed.length}/${results.length} passed`)
await browser.close()
process.exit(failed.length ? 2 : 0)
