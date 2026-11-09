import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const base = process.env.SHOT_BASE || 'http://127.0.0.1:5178/'
const out = resolve('../docs/layout-check/seg-mask')
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

async function sampleSegMask(ms, segText) {
  return page.evaluate(async ({ duration, segText }) => {
    const seg = [...document.querySelectorAll('.seg.has-seg-mask')].find(s => s.textContent.includes(segText)) || document.querySelector('.seg.has-seg-mask')
    const mask = seg.querySelector('.seg-mask')
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
  }, { duration: ms, segText })
}

try {
  await page.goto(`${base}#/overview`, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => document.querySelector('.seg.has-seg-mask .seg-mask'))
  await sleep(600)

  const initial = await page.evaluate(() => {
    const seg = document.querySelector('.seg.has-seg-mask')
    const mask = seg.querySelector('.seg-mask')
    const active = seg.querySelector('.seg__item.is-active')
    const s = getComputedStyle(mask)
    return { left: Number(s.left.replace('px', '')), width: Number(s.width.replace('px', '')), btnLeft: active.offsetLeft, btnWidth: active.offsetWidth, label: active.textContent.trim() }
  })
  check('顶栏时间范围遮罩初始覆盖「今日」', initial.left === initial.btnLeft && Math.abs(initial.width - initial.btnWidth) < 2, initial)
  const sampler = sampleSegMask(600)
  await page.evaluate(() => {
    const seg = document.querySelector('.seg.has-seg-mask')
    ;[...seg.querySelectorAll('.seg__item')].find(b => b.textContent.trim() === '近 7 天').click()
  })
  const samples = await sampler
  const frames = samples.filter(s => s.width > 0)
  const target = await page.evaluate(() => {
    const seg = document.querySelector('.seg.has-seg-mask')
    const active = seg.querySelector('.seg__item.is-active')
    return { left: active.offsetLeft, width: active.offsetWidth, label: active.textContent.trim() }
  })
  const distinct = new Set(frames.map(s => Math.round(s.left * 10))).size
  check('遮罩滑向「近7天」且帧连续', distinct >= 15 && frames[0].left < target.left && Math.abs(frames[frames.length - 1].left - target.left) < 2, { distinct, from: frames[0].left, to: frames[frames.length - 1].left, target: target.left })

  const fromLeft = frames[0].left
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
  await page.screenshot({ path: resolve(out, 'range-switched.png') })

  // 第二处 seg：Cells 页制式筛选（seg--sm 尺寸）
  await page.goto(`${base}#/cells`, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => document.querySelectorAll('.seg.has-seg-mask').length >= 2)
  await sleep(600)
  const sampler2 = sampleSegMask(600, '全部')
  await page.evaluate(() => {
    const seg = [...document.querySelectorAll('.seg.has-seg-mask')].find(s => s.textContent.includes('全部'))
    ;[...seg.querySelectorAll('.seg__item')].find(b => b.textContent.trim() === '5G').click()
  })
  const samples2 = await sampler2
  const frames2 = samples2.filter(s => s.width > 0)
  const distinct2 = new Set(frames2.map(s => Math.round(s.left * 10))).size
  const target2 = await page.evaluate(() => {
    const seg = [...document.querySelectorAll('.seg.has-seg-mask')].find(s => s.textContent.includes('全部'))
    return seg.querySelector('.seg__item.is-active').textContent.trim()
  })
  check('Cells 制式筛选遮罩滑动', distinct2 >= 15 && target2 === '5G', { distinct: distinct2, target: target2 })

  // 减少动画偏好下仍滑动
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await sleep(80)
  const sampler3 = sampleSegMask(600, '全部')
  await page.evaluate(() => {
    const seg = [...document.querySelectorAll('.seg.has-seg-mask')].find(s => s.textContent.includes('全部'))
    ;[...seg.querySelectorAll('.seg__item')].find(b => b.textContent.trim() === '4G').click()
  })
  const samples3 = await sampler3
  const distinct3 = new Set(samples3.filter(s => s.width > 0).map(s => Math.round(s.left * 10))).size
  check('减少动画偏好下仍平滑滑动', distinct3 >= 15, `${distinct3} 个不同位置`)

  check('浏览器无错误', errors.length === 0, errors)
  console.log(`SUMMARY: ${results.filter(r => r.ok).length}/${results.length} passed`)
} finally { await browser.close() }
process.exitCode = results.filter(r => r.ok).length === results.length ? 0 : 1
