import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const base = process.env.SHOT_BASE || 'http://127.0.0.1:5178/'
const out = resolve('../docs/layout-check')
mkdirSync(out, { recursive: true })
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1600, height: 1000 } })
const page = await browser.newPage()
const errors = [], failures = []
let count = 0
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
function check(name, ok, detail = '') { count++; if (!ok) failures.push(name); console.log(ok ? 'PASS' : 'FAIL', name, JSON.stringify(detail)) }
async function go(route) {
  await page.goto(`${base}#/${route}`, { waitUntil: 'networkidle0' })
  await sleep(900)
  await page.waitForFunction(() => [...document.querySelectorAll('.chart-box')].every(el => el.__chart))
  await sleep(650)
}
async function clickText(text) { await page.evaluate(text => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === text)?.click(), text); await sleep(600) }
async function point(selector, values) {
  await page.$eval(selector, el => el.scrollIntoView({ block: 'center' }))
  await sleep(150)
  return page.$eval(selector, (el, values) => {
    const xy = el.__chart.convertToPixel({ seriesIndex: 0 }, values), box = el.getBoundingClientRect()
    return { x: box.x + xy[0], y: box.y + xy[1] }
  }, values)
}
try {
  await go('hourly')
  check('时段页默认只展示整周热力图', await page.$$eval('.day-button', els => els.length === 7) && !(await page.$('.day-details')) && !(await page.$('.kpi')))
  const weeklyValues = await page.$eval('[data-template="F10"] .chart-box', el => el.__chart.getOption().series[0].data)
  const expectDay = day => weeklyValues.filter(point => point[1] === day).sort((a, b) => a[0] - b[0]).map(point => point[2])
  await page.click('.day-button')
  await page.waitForFunction(() => document.querySelector('[data-chart="day-trend"] .chart-box')?.__chart)
  await sleep(600)
  const selectedDayValues = await page.$eval('[data-chart="day-trend"] .chart-box', el => el.__chart.getOption().series[0].data)
  check('左侧日期展开同一天的 24 个小时读数', JSON.stringify(selectedDayValues) === JSON.stringify(expectDay(6)) && await page.$$eval('.day-details .kpi', els => els.length === 3))
  await page.click('.day-button:nth-child(2)')
  await sleep(500)
  check('更换日期后小时图同步', JSON.stringify(await page.$eval('[data-chart="day-trend"] .chart-box', el => el.__chart.getOption().series[0].data)) === JSON.stringify(expectDay(5)))
  await page.click('.day-button:last-child')
  await sleep(500)
  check('最早一天不虚构前一天对比', await page.$eval('[data-chart="day-trend"] .chart-box', el => el.__chart.getOption().series.length === 1))
  await page.click('.day-button')
  await sleep(500)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: resolve(out, 'hourly-day-selected.png'), fullPage: true })
  const waffle = await page.$eval('.share-waffle', el => ({ dots: el.querySelectorAll('svg > circle').length, shares: [...el.querySelectorAll('.waffle-legend strong')].map(el => parseFloat(el.textContent)), labels: [...el.querySelectorAll('.waffle-legend li')].map(el => el.textContent) }))
  check('全天构成含其他时段并覆盖 100%', waffle.dots === 100 && Math.abs(waffle.shares.reduce((a, b) => a + b, 0) - 100) < .3 && waffle.labels.some(text => text.includes('其他时段')), waffle)
  const heat = await page.$eval('[data-template="F10"] .chart-box', el => el.__chart.getOption().series[0].data)
  check('圆点热力图保留 7×24 个真实读数', heat.length === 168 && new Set(heat.map(point => `${point[0]}:${point[1]}`)).size === 168)
  const pick = await point('[data-template="F10"] .chart-box', [12, 3])
  await page.mouse.click(pick.x, pick.y)
  await sleep(250)
  check('点击圆点可读到日期和时段', await page.$eval('.heat-pick', el => /12:00/.test(el.textContent)))
  await clickText('占当天')
  const sums = await page.$eval('[data-template="F10"] .chart-box', el => {
    const days = {}
    for (const [hour, day, value] of el.__chart.getOption().series[0].data) days[day] = (days[day] || 0) + value
    return Object.values(days)
  })
  check('圆点占比模式每天合计 100%', sums.length === 7 && sums.every(sum => Math.abs(sum - 100) < 1e-6), sums)
  await clickText('收起详情')
  check('收起当天详情后回到整周视图', !(await page.$('.day-details')) && Boolean(await page.$('.weekly-panel')))

  await go('overview')
  const unitBefore = await page.$eval('[data-template="F5"] .chart-note', el => el.textContent)
  const rankPoint = await point('[data-template="F5"] .chart-box', [1e16, 0])
  await page.mouse.move(rankPoint.x, rankPoint.y)
  await sleep(300)
  check('刻度排名支持鼠标读数', await page.$eval('[data-template="F5"] .chart-box', el => /华东/.test(el.innerText) && /PB/.test(el.innerText)))
  await clickText('近 7 天')
  await sleep(400)
  const unitAfter = await page.$eval('[data-template="F5"] .chart-note', el => el.textContent)
  check('统计范围改变后刻度单位同步', unitBefore !== unitAfter, [unitBefore, unitAfter])
  await clickText('今日')

  await go('cells')
  const distribution = await page.$eval('[data-template="F14"] .chart-box', el => {
    const opt = el.__chart.getOption(), bins = opt.series[0].data
    return { bins, total: bins.reduce((sum, bin) => sum + bin[2], 0), thresholds: opt.series[1].markLine.data.map(mark => mark.xAxis) }
  })
  const totalCells = await page.$eval('.stats .stat strong', el => Number(el.textContent))
  check('连续分箱覆盖全部小区且无区间缺口', distribution.bins.length === 20 && distribution.total === totalCells && distribution.bins.every((bin, index) => bin[0] === index * 5 && bin[1] === (index + 1) * 5), distribution.total)
  check('直方图保留预警和拥塞阈值', distribution.thresholds.includes(70) && distribution.thresholds.includes(85), distribution.thresholds)
  const strip = await page.$eval('[data-template="G15"] .chart-box', el => el.__chart.getOption().series[0].data)
  check('分组分布展示全部小区且没有重复样本', strip.length === totalCells && new Set(strip.map(item => item.cell.id)).size === totalCells, strip.length)
  await clickText('用户规模')
  const scatter = await page.$eval('[data-template="G9"] .chart-box', el => el.__chart.getOption().series[0].data)
  check('切换用户规模后每点仍对应原始小区', scatter.length === totalCells && scatter.every(item => item.value[0] === item.cell.users && item.value[1] === item.cell.util))
  await page.evaluate(() => document.querySelector('[data-template="G9"] .chart-box').scrollIntoView({ block: 'center' }))
  const first = scatter[0], target = await point('[data-template="G9"] .chart-box', first.value)
  await page.mouse.click(target.x, target.y)
  await page.waitForSelector('.tick-gauge')
  check('散点点击可打开刻度仪表详情', await page.$eval('.tick-gauge', el => el.querySelectorAll('line').length === 100 && /忙时利用率/.test(el.getAttribute('aria-label'))))
  await sleep(800)
  await page.screenshot({ path: resolve(out, 'cell-template-details.png') })
  await page.keyboard.press('Escape')

  await go('pipeline')
  check('流程图保留五个实际阶段', await page.$$eval('.process-flow > li', els => els.length === 5 && els[0].textContent.includes('采集') && els.at(-1).textContent.includes('可视化')))
  await go('realtime')
  const shares = await page.$$eval('.p-share', els => els.map(el => parseFloat(el.textContent)))
  check('分区份额来自同一总量', shares.length === 3 && Math.abs(shares.reduce((a, b) => a + b, 0) - 100) <= .2, shares)
  check('浏览器无错误', errors.length === 0, errors)
  console.log(`SUMMARY: ${count - failures.length}/${count} passed`)
} finally { await browser.close() }
process.exitCode = failures.length ? 1 : 0
