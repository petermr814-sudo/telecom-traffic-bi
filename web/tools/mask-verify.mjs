import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

// 标注动画验收：选中/切换日期时，旧下划线与峰值圈先消失，再在新日期同步重绘
// （下划线划出 + 峰值画圈），不产生位移滑动。用法：开发服启动后 node tools/mask-verify.mjs
const base = process.env.SHOT_BASE || 'http://127.0.0.1:5178/'
const out = resolve('../docs/layout-check/mask-switch')
mkdirSync(out, { recursive: true })

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
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(ok ? 'PASS' : 'FAIL', name, JSON.stringify(detail))
}

const rowH = (360 - 40) / 7 // 遮罩行高，同 .day-picker 布局
const tyOf = transform => {
  const m = transform.match(/matrix\([^)]*\)/)
  if (!m) return null
  return Number(m[0].match(/[-+]?\d+(\.\d+)?/g).map(Number)[5])
}

async function clickDayAndSample(index, ms = 820) {
  const sampler = page.evaluate(async duration => {
    const samples = []
    const start = performance.now()
    await new Promise(resolve => {
      const tick = () => {
        const mask = document.querySelector('.day-picker-mask')
        const stroke = document.querySelector('.day-picker-stroke')
        const s = getComputedStyle(mask)
        samples.push({
          t: performance.now() - start,
          transform: s.transform,
          opacity: Number(getComputedStyle(stroke).opacity),
          dash: parseFloat(getComputedStyle(stroke).strokeDashoffset) || 0
        })
        if (performance.now() - start < duration) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
    return samples
  }, ms)
  await page.evaluate(i => {
    document.querySelectorAll('.day-button')[i].click()
  }, index)
  return sampler
}

try {
  await page.goto(`${base}#/hourly`, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => Boolean(document.querySelector('[data-template="F10"] .chart-box')?.__chart))
  await sleep(700)

  // ---------- 首次选中（第 4 个按钮 = day 3）：下划线与画圈同步划出 ----------
  const first = await clickDayAndSample(3)
  const firstRows = first.map(s => ({ t: s.t, ty: tyOf(s.transform), opacity: s.opacity, dash: s.dash }))
  const firstSweep = new Set(firstRows.filter(s => s.dash > 0.02).map(s => s.dash.toFixed(2))).size
  const firstEnd = firstRows[firstRows.length - 1]
  check('选中日期从头划出下划线', Math.max(...firstRows.map(s => s.dash)) > 0.85 && firstEnd.dash < 0.06 && firstSweep >= 8,
    { maxDash: Math.round(Math.max(...firstRows.map(s => s.dash)) * 100) / 100, dashTo: Math.round(firstEnd.dash * 100) / 100, firstSweep })
  check('划出结束笔触完整呈现', firstEnd.opacity > 0.95, firstEnd.opacity)
  check('落位在选中日期行', Math.abs(firstEnd.ty - 3 * rowH) < 3, firstEnd.ty)

  // ---------- 切换日期（第 2 个按钮 = 第 1 行）：先消失，再落位重绘 ----------
  const sw = await clickDayAndSample(1)
  const swRows = sw.map(s => ({ t: s.t, ty: tyOf(s.transform), opacity: s.opacity, dash: s.dash }))
  const distinctTy = new Set(swRows.map(s => s.ty.toFixed(1))).size
  const minOpacity = Math.min(...swRows.map(s => s.opacity))
  const swEnd = swRows[swRows.length - 1]
  const firstHidden = swRows.findIndex(s => s.opacity < 0.15)
  const redraw = swRows.slice(Math.max(0, firstHidden))
  const sweepDistinct = new Set(redraw.map(s => s.dash.toFixed(2))).size
  check('切换日期不做位移（直接落位）', distinctTy <= 2, { distinctTy })
  check('旧下划线与峰值圈先消失', minOpacity < 0.12, { minOpacity: Math.round(minOpacity * 100) / 100 })
  check('新标注重新划出（同步绘制）', Math.max(...swRows.map(s => s.dash)) > 0.85 && swEnd.dash < 0.06 && sweepDistinct >= 8,
    { maxDash: Math.round(Math.max(...swRows.map(s => s.dash)) * 100) / 100, dashTo: Math.round(swEnd.dash * 100) / 100, sweepDistinct })
  check('先消失后重绘', firstHidden >= 0 && swRows.findIndex(s => s.dash > 0.5) > firstHidden, { firstHidden })
  check('重绘终点停在新日期行', Math.abs(swEnd.ty - 1 * rowH) < 3, swEnd.ty)
  await sleep(200)
  await page.screenshot({ path: resolve(out, 'mask-selected.png') })

  // ---------- 减少动态效果：直接呈现最终态 ----------
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await sleep(80)
  await page.evaluate(() => {
    document.querySelectorAll('.day-button')[4].click()
  })
  await sleep(80)
  const reduced = await page.evaluate(() => {
    const mask = document.querySelector('.day-picker-mask')
    const stroke = document.querySelector('.day-picker-stroke')
    return {
      ty: parseFloat(getComputedStyle(mask).transform.split(',')[5]) || 0,
      opacity: Number(getComputedStyle(stroke).opacity),
      dash: parseFloat(getComputedStyle(stroke).strokeDashoffset) || 0
    }
  })
  check('减少动态效果下直接呈现最终态', reduced.opacity > 0.95 && reduced.dash < 0.06 && Math.abs(reduced.ty - 4 * rowH) < 3, reduced)

  check('浏览器无错误', errors.length === 0, errors)
  console.log(`SUMMARY: ${results.filter(r => r.ok).length}/${results.length} passed`)
} finally { await browser.close() }
process.exitCode = results.filter(r => r.ok).length === results.length ? 0 : 1
