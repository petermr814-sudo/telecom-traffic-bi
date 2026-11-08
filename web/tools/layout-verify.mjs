import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.env.SHOT_BASE || 'http://127.0.0.1:5178/'
const OUT = resolve('..', 'docs', 'layout-check')
mkdirSync(OUT, { recursive: true })
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true, args: ['--no-sandbox'],
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
const failures = []
let checks = 0
function check(label, ok, detail) {
  checks++
  console.log(ok ? 'PASS' : 'FAIL', label, JSON.stringify(detail ?? ''))
  if (!ok) failures.push(label)
}
try {
  for (const width of [1280, 768, 390]) {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 })
    for (const route of ['overview', 'hourly', 'region', 'cells', 'realtime', 'pipeline']) {
      await page.goto(`${BASE}#/${route}`, { waitUntil: 'networkidle0' })
      await new Promise(resolve => setTimeout(resolve, 800))
      await page.waitForFunction(() => {
        const charts = [...document.querySelectorAll('.chart-box')]
        return charts.length ? charts.every(el => el.__chart) : Boolean(document.querySelector('.jobs-panel, .traffic-scene canvas'))
      })
      await new Promise(resolve => setTimeout(resolve, 750))
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        errorCards: document.querySelectorAll('.error-card').length,
        panelsOutside: [...document.querySelectorAll('.panel, .kpi, .stats, .rt')].filter(el => {
          const box = el.getBoundingClientRect()
          return box.width > 0 && (box.right > innerWidth + 1 || box.left < -1)
        }).map(el => el.className),
        charts: [...document.querySelectorAll('.chart-box')].map(el => ({ width: el.clientWidth, rendered: Boolean(el.__chart) })),
      }))
      check(`${width} ${route} 布局`, layout.overflow <= 1 && !layout.errorCards && !layout.panelsOutside.length && layout.charts.every(c => c.width > 80 && c.rendered), layout)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: resolve(OUT, `${route}-${width}.png`), fullPage: true })
      if (route === 'hourly') {
        await page.click('.day-button')
        await page.waitForFunction(() => document.querySelector('[data-chart="day-trend"] .chart-box')?.__chart)
        await new Promise(resolve => setTimeout(resolve, 700))
        const detail = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, cards: document.querySelectorAll('.day-details .kpi').length }))
        check(`${width} 当天详情布局`, detail.overflow <= 1 && detail.cards === 3, detail)
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.screenshot({ path: resolve(OUT, `hourly-detail-${width}.png`), fullPage: true })
      }
    }
  }
  await page.setViewport({ width: 1280, height: 900 })
  await page.goto(`${BASE}#/pipeline`, { waitUntil: 'networkidle0' })
  check('技术说明默认收起', await page.$eval('.disclosure', el => !el.open && !el.querySelector('.endpoints')))
  await page.focus('.disclosure summary')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.endpoints li')
  check('技术说明支持键盘展开', await page.$$eval('.endpoints li', els => els.length === 8))
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: resolve(OUT, 'pipeline-expanded.png'), fullPage: true })
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => !document.querySelector('.disclosure').open)
  check('技术说明支持再次收起', await page.$eval('.disclosure', el => !el.open))
  check('浏览器无错误', errors.length === 0, errors)
  console.log(`SUMMARY: ${checks - failures.length}/${checks} passed`)
} finally {
  await browser.close()
}
process.exitCode = failures.length ? 1 : 0
