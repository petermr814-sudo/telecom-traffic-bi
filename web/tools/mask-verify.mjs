import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

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

// 二次缓动参考值：p<0.5 ? 2p² : 1-2(1-p)²
const quadEase = p => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2)
const rowH = (360 - 40) / 7 // 遮罩行高，同 .day-picker 布局
const tyOf = transform => {
  const m = transform.match(/matrix\([^)]*\)/)
  if (!m) return null
  return Number(m[0].match(/[-+]?\d+(\.\d+)?/g).map(Number)[5])
}

async function clickDayAndSample(index, ms = 700) {
  const sampler = page.evaluate(async (duration) => {
    const samples = []
    const start = performance.now()
    await new Promise(resolve => {
      const tick = () => {
        const mask = document.querySelector('.day-picker-mask')
        const s = getComputedStyle(mask)
        samples.push({ t: performance.now() - start, transform: s.transform, opacity: s.opacity })
        if (performance.now() - start < duration) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
    return samples
  }, ms)
  await page.evaluate((i) => {
    document.querySelectorAll('.day-button')[i].click()
  }, index)
  return sampler
}

try {
  await page.goto(`${base}#/hourly`, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => document.querySelector('.day-button'))
  await sleep(600)

  // 点击第 4 个日期按钮（daily[3]）：遮罩应从 600% 滑到 300%
  const samples = await clickDayAndSample(3)
  const rows = samples.map(s => ({ t: s.t, ty: tyOf(s.transform), opacity: s.opacity }))
  const active = rows.filter(s => s.ty !== null)
  const distinct = new Set(active.map(s => Math.round(s.ty * 10))).size

  check('遮罩有连续位移动画', distinct >= 20, `${distinct} 个不同位置`)
  check('位移方向正确（向上滑向选中行）', active[0].ty > active[active.length - 1].ty, `${active[0].ty} -> ${active[active.length - 1].ty}`)
  check('终点停在目标行', Math.abs(active[active.length - 1].ty - 3 * rowH) < 3, active[active.length - 1].ty)
  check('透明度同步淡入', active[0].opacity !== '1' && active[active.length - 1].opacity === '1', `${active[0].opacity} -> ${active[active.length - 1].opacity}`)

  // 二次缓动轨迹形状检验：点击→首帧存在几十 ms 的启动延迟，且随帧率抖动，
  // 因此用「采样轨迹 vs 理论缓动曲线」做带自由偏移 Δ 的最小误差拟合，
  // Δ 落在合理范围且拟合误差很小即证明轨迹就是 quadEase 的形状。
  const fromTy = 6 * rowH
  const toTy = 3 * rowH
  let best = { delta: 0, err: Infinity }
  for (let delta = 0; delta <= 100; delta += 2) {
    let sum = 0, n = 0
    for (const s of active) {
      const p = Math.min(1, Math.max(0, (s.t - delta) / 440))
      const expect = fromTy + (toTy - fromTy) * quadEase(p)
      sum += Math.abs(s.ty - expect); n++
    }
    const err = sum / n
    if (err < best.err) best = { delta, err }
  }
  check('滑动轨迹符合二次缓动曲线', best.err < 4 && best.delta >= 0 && best.delta <= 80, best)
  await sleep(300)
  await page.screenshot({ path: resolve(out, 'mask-selected.png') })

  // 系统「减少动画」开启时仍播放滑动（本次修复：遮罩不再因该偏好直接跳变）
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await sleep(80)
  const reducedSamples = await clickDayAndSample(1)
  const reducedActive = reducedSamples.map(s => tyOf(s.transform)).filter(v => v !== null)
  const reducedDistinct = new Set(reducedActive.map(v => Math.round(v * 10))).size
  check('减少动画偏好下仍平滑滑动', reducedDistinct >= 20, `${reducedDistinct} 个不同位置`)

  check('浏览器无错误', errors.length === 0, errors)
  console.log(`SUMMARY: ${results.filter(r => r.ok).length}/${results.length} passed`)
} finally { await browser.close() }
process.exitCode = results.filter(r => r.ok).length === results.length ? 0 : 1
