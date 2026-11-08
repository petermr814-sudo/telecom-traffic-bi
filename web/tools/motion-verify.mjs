import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const base = process.env.SHOT_BASE || 'http://127.0.0.1:18080/'
const out = resolve('../docs/layout-check/motion')
mkdirSync(out, { recursive: true })
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1600, height: 1000 } })
const page = await browser.newPage()
const errors = [], failures = []
let checks = 0
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
function check(name, ok, detail = '') { checks++; if (!ok) failures.push(name); console.log(ok ? 'PASS' : 'FAIL', name, JSON.stringify(detail)) }
const button = view => `.scatter-panel button:nth-child(${view === 'users' ? 2 : 1})`
async function settle() { await page.waitForFunction(() => !document.querySelector('.scatter-panel')?.dataset.motion); await sleep(80) }
async function state() {
  return page.$eval('.scatter-panel', el => {
    const chart = el.querySelector('.chart-box').__chart, option = chart.getOption()
    const visibleText = chart.getZr().storage.getDisplayList(true).filter(el => el.type === 'tspan' && !el.ignore).map(el => String(el.style.text))
    return { mode: el.dataset.template, motion: el.dataset.motion, progress: el.dataset.motionProgress, particles: Number(el.dataset.motionParticles || 0), title: el.querySelector('.panel-title').textContent.trim(), titleOpacity: getComputedStyle(el.querySelector('.panel-title')).opacity, x: option.xAxis[0], y: option.yAxis[0], records: option.series[0].data.length, visibleText, layers: el.querySelectorAll('.scatter-motion-layer').length }
  })
}
try {
  await page.goto(`${base}#/cells`, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => document.querySelector('.scatter-panel .chart-box')?.__chart)
  await sleep(600)
  await page.$eval('.scatter-panel', el => el.scrollIntoView({ block: 'center' }))
  await page.$('.scatter-panel').then(el => el.screenshot({ path: resolve(out, '01-strip.png') }))
  await page.click(button('users'))
  await sleep(90)
  const active = await state()
  check('切换启用字形粒子层', active.motion === 'running' && active.particles > 100 && active.titleOpacity === '0', { particles: active.particles, progress: active.progress })
  const ink = await page.$eval('.scatter-motion-layer', canvas => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 10) count++
    return count
  })
  check('粒子和轴线确实绘制到画面', ink > 300, ink)
  await page.$('.scatter-panel').then(el => el.screenshot({ path: resolve(out, '02-burst.png') }))
  await sleep(130)
  await page.$('.scatter-panel').then(el => el.screenshot({ path: resolve(out, '03-reform.png') }))
  await settle()
  const users = await state()
  check('新坐标与文字完整恢复', users.mode === 'G9' && users.titleOpacity === '1' && users.visibleText.some(text => text === '100%') && users.visibleText.some(text => text.includes('000')), { title: users.title, text: users.visibleText })
  check('数据与交互目标保持完整', users.records === 420 && users.x.max !== 100 && users.y.max === 100, { records: users.records, xmax: users.x.max, ymax: users.y.max })
  await page.$('.scatter-panel').then(el => el.screenshot({ path: resolve(out, '04-users.png') }))

  await page.click(button('strip')); await sleep(70)
  await page.click(button('users')); await sleep(70)
  await page.click(button('strip')); await sleep(70)
  await page.click(button('users'))
  await settle()
  const rapid = await state()
  check('连续反向切换以最后一次选择为准', rapid.mode === 'G9' && rapid.records === 420 && rapid.titleOpacity === '1' && rapid.layers === 1, rapid.title)
  const residue = await page.$eval('.scatter-motion-layer', canvas => getComputedStyle(canvas).display)
  check('结束后不残留粒子或隐藏文字', residue === 'none' && !rapid.motion)

  await page.focus(button('strip'))
  await page.keyboard.press('Enter')
  await sleep(40)
  const keyboard = await state()
  check('键盘切换即时完成', keyboard.mode === 'G15' && !keyboard.motion && keyboard.titleOpacity === '1')
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await sleep(50)
  await page.click(button('users'))
  await sleep(40)
  const reduced = await state()
  check('减少动态效果时跳过粒子和位移', reduced.mode === 'G9' && !reduced.motion && reduced.titleOpacity === '1')
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
  await sleep(50)
  await page.click(button('strip'))
  await sleep(70)
  await page.setViewport({ width: 390, height: 900 })
  await settle()
  check('切换中缩放窗口能正确收尾', (await state()).titleOpacity === '1')
  check('手机宽度不横向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await page.goto(`${base}#/overview`, { waitUntil: 'networkidle0' })
  check('离开页面清除动画层', !(await page.$('.scatter-motion-layer')))
  check('浏览器无错误', errors.length === 0, errors)
  console.log(`SUMMARY: ${checks - failures.length}/${checks} passed`)
} finally { await browser.close() }
process.exitCode = failures.length ? 1 : 0
