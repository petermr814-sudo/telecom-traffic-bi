import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = process.env.SHOT_BASE || 'http://127.0.0.1:5178/'
const OUT = resolve(process.cwd(), '..', 'docs')
mkdirSync(OUT, { recursive: true })

const routes = [
  ['/overview', 'overview', 1000],
  ['/hourly', 'hourly', 1250],
  ['/region', 'region', 1450],
  ['/cells', 'cells', 1350],
  ['/realtime', 'realtime', 1000],
  ['/pipeline', 'pipeline', 1300]
]

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1'],
  defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 }
})

const page = await browser.newPage()
const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    errors.push(msg.text())
    console.log('CONSOLE ERROR:', msg.text())
  }
})
page.on('pageerror', (err) => {
  errors.push(err.message)
  console.log('PAGE ERROR:', err.message, '\n', err.stack)
})

for (const [route, name, height] of routes) {
  await page.setViewport({ width: 1600, height, deviceScaleFactor: 1 })
  await page.goto('about:blank')
  await page.goto(`${BASE}#${route}`, { waitUntil: 'networkidle0', timeout: 45000 })
  await new Promise((r) => setTimeout(r, 1600))
  const info = await page.evaluate(() => {
    const el = document.querySelector('.content-inner')
    return {
      opacity: el ? getComputedStyle(el).opacity : 'n/a',
      height: document.body.scrollHeight,
      errorCards: document.querySelectorAll('.error-card').length,
      title: document.querySelector('h1')?.textContent
    }
  })
  const file = resolve(OUT, `shot-${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  console.log(name, JSON.stringify(info), '->', file)
}

console.log('TOTAL CONSOLE ERRORS:', errors.length)
await browser.close()
