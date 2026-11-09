// 一次性诊断：layout-verify「技术说明默认收起」断言各部分的真实状态
import puppeteer from 'puppeteer-core'

const BASE = process.env.SHOT_BASE || 'http://127.0.0.1:5178/'
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 })
await page.goto(`${BASE}#/pipeline`, { waitUntil: 'networkidle0' })

const probe = async tag => {
  const s = await page.evaluate(() => {
    const el = document.querySelector('.disclosure')
    return {
      exists: Boolean(el),
      openProp: el ? el.open : null,
      hasOpenAttr: el ? el.hasAttribute('open') : null,
      endpointsCount: el ? el.querySelectorAll('.endpoints').length : null,
      endpointsLi: el ? el.querySelectorAll('.endpoints li').length : null,
      innerLen: el ? el.innerHTML.length : null,
      className: el ? el.className : null,
    }
  })
  console.log(tag, JSON.stringify(s))
}
await probe('networkidle0 后立即:')
await new Promise(r => setTimeout(r, 800))
await probe('+800ms:')
await browser.close()
