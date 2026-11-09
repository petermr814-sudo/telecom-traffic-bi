import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const base = process.env.SHOT_BASE || 'http://127.0.0.1:5178/'
const out = resolve('../docs/layout-check/metrics-mask')
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
const quadEase = p => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2)

async function sampleMask(ms) {
  return page.evaluate(async (duration) => {
    const mask = document.querySelector('.metrics-mask')
    const out = []
    const start = performance.now()
    await new Promise(resolve => {
      const tick = () => {
        const s = getComputedStyle(mask)
        out.push({ t: performance.now() - start, left: Number(s.left.replace('px', '')), width: Number(s.width.replace('px', '')) })
        if (performance.now() - start < duration) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
    return out
  }, ms)
}

try {
  await page.goto(`${base}#/region`, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => document.querySelector('.metrics-mask'))
  await sleep(700)

  const initial = await page.evaluate(() => {
    const mask = document.querySelector('.metrics-mask')
    const btn = document.querySelector('.map-metrics button.active')
    const s = getComputedStyle(mask)
    return { left: Number(s.left.replace('px', '')), width: Number(s.width.replace('px', '')), btnLeft: btn.offsetLeft, btnWidth: btn.offsetWidth, label: btn.textContent.trim() }
  })
  check('遮罩初始即覆盖选中的「流量」', initial.left === initial.btnLeft && Math.abs(initial.width - initial.btnWidth) < 2, initial)

  // 点击「用户」，采样滑动过程
  const sampler = sampleMask(600)
  await page.evaluate(() => {
    document.querySelectorAll('.map-metrics button')[1].click()
  })
  const samples = await sampler
  const frames = samples.filter(s => s.width > 0)
  const distinctLeft = new Set(frames.map(s => Math.round(s.left * 10))).size
  const target = await page.evaluate(() => {
    const btn = document.querySelector('.map-metrics button.active')
    return { left: btn.offsetLeft, width: btn.offsetWidth, label: btn.textContent.trim() }
  })

  check('遮罩有连续滑动帧', distinctLeft >= 15, `${distinctLeft} 个不同位置`)
  check('滑向目标按钮', frames[0].left < target.left && Math.abs(frames[frames.length - 1].left - target.left) < 2, `${frames[0].left} -> ${frames[frames.length - 1].left} (目标 ${target.left})`)
  check('宽度同步过渡到目标', Math.abs(frames[frames.length - 1].width - target.width) < 2, `${frames[frames.length - 1].width} vs ${target.width}`)
  check('选中态由遮罩承担（按钮自身无胶囊背景）', await page.evaluate(() => {
    const btn = document.querySelector('.map-metrics button.active')
    return getComputedStyle(btn).backgroundColor === 'rgba(0, 0, 0, 0)' || getComputedStyle(btn).backgroundColor === 'transparent'
  }))

  // 轨迹拟合：整段滑动应符合 quadEaseInOut 形状（带启动偏移）
  const fromLeft = samples[0].left
  const toLeft = target.left
  let best = { delta: 0, err: Infinity }
  for (let delta = 0; delta <= 100; delta += 2) {
    let sum = 0, n = 0
    for (const s of frames) {
      const p = Math.min(1, Math.max(0, (s.t - delta) / 300))
      const expect = fromLeft + (toLeft - fromLeft) * quadEase(p)
      sum += Math.abs(s.left - expect); n++
    }
    const err = sum / n
    if (err < best.err) best = { delta, err }
  }
  check('滑动轨迹符合二次缓动曲线', best.err < 4 && best.delta <= 80, best)

  await sleep(300)
  await page.screenshot({ path: resolve(out, 'metric-selected.png') })

  // 系统「减少动画」开启时仍平滑滑动
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await sleep(80)
  const sampler2 = sampleMask(600)
  await page.evaluate(() => {
    document.querySelectorAll('.map-metrics button')[2].click()
  })
  const samples2 = await sampler2
  const distinct2 = new Set(samples2.filter(s => s.width > 0).map(s => Math.round(s.left * 10))).size
  check('减少动画偏好下仍平滑滑动', distinct2 >= 15, `${distinct2} 个不同位置`)

  check('浏览器无错误', errors.length === 0, errors)
  console.log(`SUMMARY: ${results.filter(r => r.ok).length}/${results.length} passed`)
} finally { await browser.close() }
process.exitCode = results.filter(r => r.ok).length === results.length ? 0 : 1
