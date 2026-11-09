import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

// 骨架屏验证：两轮浏览器 —— 加载态（拉长 mock 短延时）+ 载入完成态（正常计时），浅色/深色各截
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = process.env.SHOT_BASE || 'http://127.0.0.1:5178/'
const OUT = resolve(process.cwd(), '..', 'docs', 'skeleton-check')
mkdirSync(OUT, { recursive: true })

const routes = [
  ['/overview', 'overview', 1000],
  ['/region', 'region', 1450],
  ['/cells', 'cells', 1350],
]

function watch(page, errors) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text())
      console.log('CONSOLE ERROR:', msg.text())
    }
  })
  page.on('pageerror', (err) => {
    errors.push(err.message)
    console.log('PAGE ERROR:', err.message)
  })
}

async function shoot(page, name, { settle, theme = 'light' } = {}) {
  await page.evaluate((t) => document.documentElement.classList.toggle('theme-dark', t === 'dark'), theme)
  await new Promise((r) => setTimeout(r, settle))
  const info = await page.evaluate(() => ({
    skel: document.querySelectorAll('.skel').length,
    chart: document.querySelectorAll('.skel--chart').length,
    rows: document.querySelectorAll('.skel--rows').length,
    stats: document.querySelectorAll('.skel--stats').length,
    num: document.querySelectorAll('.skel--num').length,
    title: document.querySelector('h1')?.textContent
  }))
  const file = resolve(OUT, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  console.log(name, JSON.stringify(info), '->', file)
}

const errors = []

// ── 第一轮：拉长短延时，骨架屏保持可见 ──
{
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1'],
    defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 }
  })
  const page = await browser.newPage()
  watch(page, errors)

  // mock 的数据延时只有 80~220ms，把短 setTimeout 拉到 3.5s 才截得到加载态
  await page.evaluateOnNewDocument(() => {
    const native = window.setTimeout
    window.setTimeout = (fn, ms, ...args) =>
      native(fn, (typeof ms === 'number' && ms > 0 && ms < 500) ? 3500 : ms, ...args)
  })

  for (const [route, name, height] of routes) {
    await page.setViewport({ width: 1600, height, deviceScaleFactor: 1 })
    await page.goto(`${BASE}#${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await shoot(page, `${name}-loading-light`, { settle: 900 })
    await shoot(page, `${name}-loading-dark`, { settle: 400, theme: 'dark' })
  }
  await browser.close()
}

// ── 第二轮：正常计时，截载入完成态 ──
{
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1'],
    defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 }
  })
  const page = await browser.newPage()
  watch(page, errors)

  for (const [route, name, height] of routes) {
    await page.setViewport({ width: 1600, height, deviceScaleFactor: 1 })
    await page.goto(`${BASE}#${route}`, { waitUntil: 'networkidle0', timeout: 45000 })
    await shoot(page, `${name}-loaded-light`, { settle: 1800 })
  }
  await browser.close()
}

console.log('TOTAL CONSOLE ERRORS:', errors.length)
