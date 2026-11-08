import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

// 时段分析专项验收：圆环跟随选中日期标注峰值、遮罩层滑动动画、展开详情无横向位移。
// 用法：pnpm dev 已启动后 `node tools/hourly-verify.mjs`，可用 SHOT_BASE 覆盖地址。
const BASE = process.env.SHOT_BASE || 'http://127.0.0.1:5178/'
const OUT = resolve('..', 'docs', 'hourly-check')
mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-sandbox'],
  defaultViewport: { width: 1600, height: 1000 }
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const failures = []
let checks = 0
function check(label, ok, detail) {
  checks++
  console.log(ok ? 'PASS' : 'FAIL', label, detail === undefined ? '' : JSON.stringify(detail))
  if (!ok) failures.push(label)
}

const heatData = () => page.evaluate(() => {
  const chart = document.querySelector('[data-template="F10"] .chart-box').__chart
  return chart.getOption().series[0].data.map(d => (Array.isArray(d) ? d : d.value))
})
const clickDay = dayIndex => page.evaluate(d => {
  document.querySelectorAll('.day-button')[6 - d].click()
}, dayIndex)
const dayPeak = (data, dayIndex) => data.filter(p => p[1] === dayIndex).reduce((best, p) => (p[2] > best[2] ? p : best))

// 圆环探针：按样式公式计算圆环圆心/半径，沿圆周采样 canvas 像素统计虚线描边命中
function probeRing(hour, day, mode) {
  return page.evaluate(({ hour, day, mode }) => {
    const box = document.querySelector('[data-template="F10"] .chart-box')
    const chart = box.__chart
    const data = chart.getOption().series[0].data.map(d => (Array.isArray(d) ? d : d.value))
    const totals = {}
    for (const [h, d, v] of data) totals[d] = (totals[d] || 0) + v
    const shown = data.map(([h, d, v]) => [h, d, mode === 'abs' ? v : (totals[d] ? (v / totals[d]) * 100 : 0)])
    const max = Math.max(1, ...shown.map(p => p[2]))
    const v = shown.find(p => p[0] === hour && p[1] === day)?.[2] ?? 0
    const w = box.clientWidth
    const h = box.clientHeight
    const bandW = (w - 36) / 24
    const bandH = (h - 40) / 7
    let cx = 18 + (hour + 0.5) * bandW
    let cy = 10 + (h - 40) - (day + 0.5) * bandH
    try {
      const pt = chart.convertToPixel({ seriesIndex: 0 }, [hour, day])
      if (Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) {
        if (Math.abs(pt[0] - cx) < 6 && Math.abs(pt[1] - cy) < 6) {
          cx = pt[0]
          cy = pt[1]
        }
      }
    } catch { /* 保留手工几何 */ }
    const maxR = Math.min(bandW * 0.38, bandH * 0.36)
    const r = maxR * Math.sqrt(v / max) + 2.5
    const canvas = box.querySelector('canvas')
    const ctx = canvas.getContext('2d')
    const dpr = canvas.width / canvas.clientWidth
    let hits = 0
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2
      const x = Math.round((cx + Math.cos(a) * r) * dpr)
      const y = Math.round((cy + Math.sin(a) * r) * dpr)
      const px = ctx.getImageData(x, y, 1, 1).data
      if (px[2] > 100 && px[2] > px[0] + 20 && px[0] < 180 && px[3] > 100) hits++
    }
    return { hits, cx: Math.round(cx), cy: Math.round(cy), r: Math.round(r * 10) / 10 }
  }, { hour, day, mode })
}

const maskInfo = () => page.evaluate(() => {
  const el = document.querySelector('.day-picker-mask')
  const cs = getComputedStyle(el)
  const ty = cs.transform && cs.transform !== 'none' ? parseFloat(cs.transform.split(',')[5]) || 0 : 0
  return { ty, opacity: Number(cs.opacity), rowH: el.getBoundingClientRect().height }
})

try {
  await page.goto(`${BASE}#/hourly`, { waitUntil: 'networkidle0' })
  await sleep(1800)
  await page.waitForFunction(() => {
    const chart = document.querySelector('[data-template="F10"] .chart-box')?.__chart
    return Boolean(chart?.getOption?.().series?.[0]?.data?.length)
  })
  await sleep(600)
  await page.evaluate(() => window.scrollTo(0, 0))

  const data = await heatData()
  let gi = 0
  for (let i = 1; i < data.length; i++) if (data[i][2] > data[gi][2]) gi = i
  const globalPeak = { hour: data[gi][0], day: data[gi][1] }
  const peakA = dayPeak(data, 2)
  const peakB = dayPeak(data, 5)

  // ---------- 圆环：默认标注全周最大格 ----------
  const rDefault = await probeRing(globalPeak.hour, globalPeak.day, 'abs')
  check('未选中日期时圆环标出全周峰值格', rDefault.hits >= 8, rDefault)
  await page.screenshot({ path: resolve(OUT, 'ring-default.png'), clip: await page.$eval('[data-template="F10"]', el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }) })

  // ---------- 选中日期：圆环自动标注当天峰值时段 ----------
  await clickDay(2)
  await sleep(650)
  const rA = await probeRing(peakA[0], peakA[1], 'abs')
  check('选中日期后圆环标出当天峰值时段', rA.hits >= 8, { peakA, probe: rA })
  if (peakA[0] !== globalPeak.hour || peakA[1] !== globalPeak.day) {
    const rOld = await probeRing(globalPeak.hour, globalPeak.day, 'abs')
    check('圆环离开全周峰值格（跟随选中日期）', rOld.hits <= 4, rOld)
  }

  // ---------- 遮罩层：出现并停在对应日期行 ----------
  const maskA = await maskInfo()
  const expectTyA = (6 - 2) * maskA.rowH
  check('遮罩层停在选中日期行', Math.abs(maskA.ty - expectTyA) < 1.5 && Math.abs(maskA.opacity - 1) < 0.01, { ...maskA, expectTyA })

  // ---------- 选中动画 ----------
  const animName = await page.$eval('.day-button.is-selected', el => getComputedStyle(el).animationName)
  check('选中日期有选中动画', animName.includes('day-select-pop'), animName)
  await page.screenshot({ path: resolve(OUT, 'ring-day2.png'), clip: await page.$eval('[data-template="F10"]', el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }) })

  // ---------- 切换日期：遮罩层应平滑移动（逐帧轨迹） ----------
  const trace = await page.evaluate(async targetDay => {
    const el = document.querySelector('.day-picker-mask')
    const readY = () => {
      const m = getComputedStyle(el).transform
      return m && m !== 'none' ? parseFloat(m.split(',')[5]) || 0 : 0
    }
    const ys = [readY()]
    document.querySelectorAll('.day-button')[6 - targetDay].click()
    const t0 = performance.now()
    while (performance.now() - t0 < 470) {
      ys.push(readY())
      await new Promise(r => requestAnimationFrame(r))
    }
    return ys
  }, 5)
  const traceStart = trace[0]
  const traceEnd = trace[trace.length - 1]
  const lo = Math.min(traceStart, traceEnd)
  const hi = Math.max(traceStart, traceEnd)
  const midCount = trace.filter(y => y > lo + 1 && y < hi - 1).length
  const distinct = new Set(trace.map(y => y.toFixed(1))).size
  check('切换日期遮罩层有移动动画', midCount >= 3 && distinct >= 4, { traceStart: Math.round(traceStart), traceEnd: Math.round(traceEnd), midCount, distinct })
  await sleep(250)

  const rB = await probeRing(peakB[0], peakB[1], 'abs')
  check('切换日期后圆环跟随到新日期峰值', rB.hits >= 8, { peakB, probe: rB })
  if (peakA[0] !== peakB[0] || peakA[1] !== peakB[1]) {
    const rAOld = await probeRing(peakA[0], peakA[1], 'abs')
    check('圆环离开上一日期峰值格', rAOld.hits <= 4, rAOld)
  }
  await page.screenshot({ path: resolve(OUT, 'ring-day5.png'), clip: await page.$eval('[data-template="F10"]', el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }) })

  // ---------- 占当天视图：圆环仍在当天峰值 ----------
  await page.evaluate(() => [...document.querySelectorAll('.seg__item')].find(b => b.textContent.trim() === '占当天')?.click())
  await sleep(500)
  const rShare = await probeRing(peakB[0], peakB[1], 'share')
  check('占当天视图圆环仍标注当天峰值', rShare.hits >= 8, rShare)
  await page.evaluate(() => [...document.querySelectorAll('.seg__item')].find(b => b.textContent.trim() === '绝对值')?.click())
  await sleep(400)

  // ---------- 展开/收起详情：滚动条不引起横向位移 ----------
  const layout = () => page.evaluate(() => {
    const panel = document.querySelector('[data-template="F10"]').getBoundingClientRect()
    return { left: Math.round(panel.left * 10) / 10, width: Math.round(panel.width * 10) / 10, clientWidth: document.documentElement.clientWidth, details: Boolean(document.querySelector('.day-details')) }
  })
  const expanded1 = await layout()
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.replace(/\s+/g, '').includes('收起详情'))?.click())
  await sleep(550)
  const collapsed = await layout()
  await clickDay(2)
  await sleep(750)
  const expanded2 = await layout()
  check('收起详情后页面可无滚动条', !collapsed.details && collapsed.clientWidth === expanded1.clientWidth, { collapsed, expanded1 })
  check('展开详情无横向位移', Math.abs(collapsed.left - expanded2.left) < 0.5 && Math.abs(collapsed.width - expanded2.width) < 0.5 && collapsed.clientWidth === expanded2.clientWidth, { collapsed, expanded2 })

  check('浏览器无错误', errors.length === 0, errors)
  console.log(`SUMMARY: ${checks - failures.length}/${checks} passed`)
} finally {
  await browser.close()
}
process.exitCode = failures.length ? 1 : 0
