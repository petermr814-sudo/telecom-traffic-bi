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

// 圆环探针：按样式公式计算手绘墨圈的圆心/平均半径，在环带内采样 canvas 统计笔触命中
async function probeRing(hour, day, mode) {
  // BaseChart 延迟 280ms 初始化，且 HMR/重挂载会清掉 __chart——先等图表就绪再采样
  await page.waitForFunction(() => Boolean(document.querySelector('[data-template="F10"] .chart-box')?.__chart), { timeout: 4000 })
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
    // 手绘笔触在 r±2 内游走：按环带（角度 × 径向）采样，统计非白（笔触覆盖）像素
    let hits = 0
    let samples = 0
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2
      for (let k = -2; k <= 2; k += 1) {
        const rr = r + k * 0.9
        const x = Math.round((cx + Math.cos(a) * rr) * dpr)
        const y = Math.round((cy + Math.sin(a) * rr) * dpr)
        const px = ctx.getImageData(x, y, 1, 1).data
        samples++
        if (px[3] > 100 && (px[0] < 235 || px[1] < 235 || px[2] < 235)) hits++
      }
    }
    return { hits, samples, cx: Math.round(cx), cy: Math.round(cy), r: Math.round(r * 10) / 10 }
  }, { hour, day, mode })
}

const maskInfo = () => page.evaluate(() => {
  const el = document.querySelector('.day-picker-mask')
  const stroke = document.querySelector('.day-picker-stroke')
  const cs = getComputedStyle(el)
  const ty = cs.transform && cs.transform !== 'none' ? parseFloat(cs.transform.split(',')[5]) || 0 : 0
  return { ty, opacity: Number(getComputedStyle(stroke).opacity), rowH: el.getBoundingClientRect().height }
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
  check('未选中日期时圆环标出全周峰值格', rDefault.hits >= 24, rDefault)
  await page.screenshot({ path: resolve(OUT, 'ring-default.png'), clip: await page.$eval('[data-template="F10"]', el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }) })

  // ---------- 选中日期：圆环自动标注当天峰值时段 ----------
  await clickDay(2)
  await sleep(650)
  const rA = await probeRing(peakA[0], peakA[1], 'abs')
  check('选中日期后圆环标出当天峰值时段', rA.hits >= 24, { peakA, probe: rA })
  if (peakA[0] !== globalPeak.hour || peakA[1] !== globalPeak.day) {
    const rOld = await probeRing(globalPeak.hour, globalPeak.day, 'abs')
    check('圆环离开全周峰值格（跟随选中日期）', rOld.hits <= 8, rOld)
  }

  // ---------- 遮罩层：出现并停在对应日期行 ----------
  const maskA = await maskInfo()
  const expectTyA = (6 - 2) * maskA.rowH
  check('遮罩层停在选中日期行', Math.abs(maskA.ty - expectTyA) < 1.5 && Math.abs(maskA.opacity - 1) < 0.01, { ...maskA, expectTyA })

  // ---------- 选中动画 ----------
  const animName = await page.$eval('.day-button.is-selected', el => getComputedStyle(el).animationName)
  check('选中日期有选中动画', animName.includes('day-select-pop'), animName)
  await page.screenshot({ path: resolve(OUT, 'ring-day2.png'), clip: await page.$eval('[data-template="F10"]', el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }) })

  // ---------- 切换日期：旧标注消失后在新日期重绘（不做位移） ----------
  const trace = await page.evaluate(async targetDay => {
    const mask = document.querySelector('.day-picker-mask')
    const stroke = document.querySelector('.day-picker-stroke')
    const readY = () => {
      const m = getComputedStyle(mask).transform
      return m && m !== 'none' ? parseFloat(m.split(',')[5]) || 0 : 0
    }
    const samples = []
    const record = () => samples.push({
      ty: readY(),
      opacity: Number(getComputedStyle(stroke).opacity),
      dash: parseFloat(getComputedStyle(stroke).strokeDashoffset) || 0
    })
    record()
    document.querySelectorAll('.day-button')[6 - targetDay].click()
    const t0 = performance.now()
    while (performance.now() - t0 < 820) {
      record()
      await new Promise(r => requestAnimationFrame(r))
    }
    return samples
  }, 5)
  const distinctTy = new Set(trace.map(s => s.ty.toFixed(1))).size
  const minOpacity = Math.min(...trace.map(s => s.opacity))
  const dashValues = trace.map(s => s.dash)
  const dashTo = dashValues[dashValues.length - 1]
  const firstHidden = trace.findIndex(s => s.opacity < 0.15)
  const redraw = trace.slice(Math.max(0, firstHidden))
  const sweepDistinct = new Set(redraw.map(s => s.dash.toFixed(2))).size
  check('切换日期不做位移（直接落位）', distinctTy <= 2, { distinctTy })
  check('旧标注先消失', minOpacity < 0.12, { minOpacity })
  check('新下划线从头划出并收笔', Math.max(...dashValues) > 0.85 && dashTo < 0.06 && sweepDistinct >= 8, { maxDash: Math.round(Math.max(...dashValues) * 100) / 100, dashTo: Math.round(dashTo * 100) / 100, sweepDistinct })
  check('先消失后重绘', firstHidden >= 0 && trace.findIndex(s => s.dash > 0.5) > firstHidden, { firstHidden })
  await sleep(250)

  const rB = await probeRing(peakB[0], peakB[1], 'abs')
  check('切换日期后圆环跟随到新日期峰值', rB.hits >= 24, { peakB, probe: rB })
  if (peakA[0] !== peakB[0] || peakA[1] !== peakB[1]) {
    const rAOld = await probeRing(peakA[0], peakA[1], 'abs')
    check('圆环离开上一日期峰值格', rAOld.hits <= 8, rAOld)
  }
  await page.screenshot({ path: resolve(OUT, 'ring-day5.png'), clip: await page.$eval('[data-template="F10"]', el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }) })

  // ---------- 占当天视图：圆环仍在当天峰值 ----------
  await page.evaluate(() => [...document.querySelectorAll('.seg__item')].find(b => b.textContent.trim() === '占当天')?.click())
  await sleep(500)
  const rShare = await probeRing(peakB[0], peakB[1], 'share')
  check('占当天视图圆环仍标注当天峰值', rShare.hits >= 24, rShare)
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
