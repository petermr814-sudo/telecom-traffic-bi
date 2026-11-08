import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const base = process.env.SHOT_BASE || 'http://127.0.0.1:5178/'
const out = resolve('../docs/layout-check/page-switch')
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

// 在页面里用 rAF 连续采样过渡元素的计算样式，返回 [t, className, opacity, transform] 序列
async function sampleTransition(ms) {
  return page.evaluate(async (duration) => {
    const samples = []
    const start = performance.now()
    await new Promise(resolve => {
      const tick = () => {
        const el = document.querySelector('.page-enter-active, .page-leave-active')
        if (el) {
          const s = getComputedStyle(el)
          const beziers = s.transitionTimingFunction.match(/cubic-bezier\([^)]*\)/g) || []
          samples.push({
            t: Math.round(performance.now() - start),
            cls: el.className,
            opacity: s.opacity,
            transform: s.transform,
            // transition 声明顺序为 opacity, transform，取第二个即移动的缓动
            easing: beziers[1] || beziers[0] || ''
          })
        }
        if (performance.now() - start < duration) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
    return samples
  }, ms)
}

try {
  await page.goto(`${base}#/overview`, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => document.querySelector('.kpi-value'))
  await sleep(800)

  // 点击侧栏「时段分析」触发路由切换，同时采样整个 out-in 过程
  const sampler = sampleTransition(900)
  await page.click('a[href="#/hourly"]')
  const samples = await sampler

  const leave = samples.filter(s => s.cls.includes('page-leave'))
  const enter = samples.filter(s => s.cls.includes('page-enter'))
  const tx = m => (m.match(/matrix\([^)]*\)/) ? m.match(/[-+]?\d+(\.\d+)?/g).map(Number)[4] : 0)

  check('离开阶段有移动动画', leave.some(s => tx(s.transform) < -4), leave.slice(0, 3).map(s => tx(s.transform)))
  check('进入阶段从右侧滑入', enter.some(s => tx(s.transform) > 12), enter.slice(0, 3).map(s => tx(s.transform)))
  check('进入用二次贝塞尔 easeOutQuad', enter.length > 0 && enter[0].easing === 'cubic-bezier(0.333, 0.667, 0.667, 1)', enter[0]?.easing)
  check('离开用二次贝塞尔 easeInQuad', leave.length > 0 && leave[0].easing === 'cubic-bezier(0.333, 0, 0.667, 0.333)', leave[0]?.easing)
  check('透明度随移动同步过渡', enter.some(s => s.opacity !== '1' && s.opacity !== '0'), enter.slice(0, 3).map(s => s.opacity))
  await sleep(500)

  const settled = await page.evaluate(() => {
    const el = document.querySelector('.page-enter-active, .page-leave-active')
    if (el) {
      const s = getComputedStyle(el)
      return { cls: el.className, opacity: s.opacity, transform: s.transform }
    }
    return null
  })
  check('过渡结束后无残留类名且位置归零', !settled || (settled.opacity === '1' && settled.transform === 'none'), settled)
  check('目标页面内容正常', await page.evaluate(() => Boolean(document.querySelector('.hourly-page, main *[class]'))))
  await page.screenshot({ path: resolve(out, 'after-switch.png') })

  // 进入动画中段截图（重新切一次，抓 enter 进行中的画面）
  const sampler2 = sampleTransition(600)
  await page.click('a[href="#/overview"]')
  await sleep(220)
  await page.screenshot({ path: resolve(out, 'mid-enter.png') })
  const samples2 = await sampler2
  const enter2 = samples2.filter(s => s.cls.includes('page-enter'))
  check('再次切换仍触发移动动画', enter2.some(s => tx(s.transform) > 6), enter2.slice(0, 3).map(s => tx(s.transform)))
  await sleep(500)

  // 减少动态效果时动画应被全局禁用
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await sleep(80)
  const reduced = await page.evaluate(() => {
    const el = document.querySelector('.page-enter-active, .page-leave-active')
    return el ? getComputedStyle(el).transitionDuration : 'none-active'
  })
  check('减少动态效果时过渡几乎为零', reduced === 'none-active' || reduced === '0.00001s', reduced)

  check('浏览器无错误', errors.length === 0, errors)
  console.log(`SUMMARY: ${results.filter(r => r.ok).length}/${results.length} passed`)
} finally {
  await browser.close()
}
process.exitCode = results.filter(r => r.ok).length === results.length ? 0 : 1
