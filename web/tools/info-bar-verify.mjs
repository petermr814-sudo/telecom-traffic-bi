import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const base = process.env.SHOT_BASE || 'http://127.0.0.1:5178/'
const out = resolve('../docs/layout-check/info-bar')
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

try {
  await page.goto(`${base}#/overview`, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => document.querySelector('.info-toggle'))
  await sleep(800)

  const toggle = await page.evaluate(() => ({
    exists: Boolean(document.querySelector('.info-toggle')),
    badge: document.querySelector('.info-toggle__badge')?.textContent?.trim() ?? '0'
  }))
  check('右上角有信息栏开关且带告警角标', toggle.exists && Number(toggle.badge) > 0, toggle)

  await page.click('.info-toggle')
  await sleep(400)
  const panel = await page.evaluate(() => {
    const el = document.querySelector('.info-panel')
    if (!el) return null
    const s = getComputedStyle(el)
    const rect = el.getBoundingClientRect()
    return {
      position: s.position,
      top: s.top, right: s.right,
      sections: [...el.querySelectorAll('.info-section__head')].map(h => h.textContent.trim()),
      rows: [...el.querySelectorAll('.info-row__label')].map(r => r.textContent.trim()),
      rectTop: rect.top, rectRight: rect.right
    }
  })
  check('面板固定于右上角且不随文档流', panel?.position === 'fixed' && Number(panel.rectRight) > 1200 && Number(panel.rectTop) < 90, panel && { position: panel.position, top: panel.rectTop, right: panel.rectRight })
  check('包含运行状态与快捷操作分区', panel?.sections.length === 2 && panel.sections.join(',').includes('运行状态') && panel.sections.join(',').includes('快捷操作'), panel?.sections)
  check('告警/区域/刷新等行齐全', ['数据模式', '当前区域', '数据更新', '待处理告警', '刷新数据', '导出当前页 CSV', '全屏演示', '偏好设置'].every(t => panel?.rows.some(r => r.includes(t))), panel?.rows)
  await page.screenshot({ path: resolve(out, 'panel-open.png') })

  // 区域联动：选华东，面板收起、数据刷新，重开面板可见标签已更新
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.info-row')].find(el => el.textContent.includes('当前区域'))
    row?.querySelector('button')?.click()
  })
  await sleep(200)
  await page.evaluate(() => [...document.querySelectorAll('.region-grid__item')].find(el => el.textContent.trim() === '华东').click())
  await sleep(250)
  check('选择区域后面板自动收起', await page.evaluate(() => !document.querySelector('.info-panel')))
  await page.click('.info-toggle')
  await sleep(300)
  const regionLabel = await page.evaluate(() => document.querySelector('.info-row__value--btn')?.textContent?.trim())
  check('区域选择后标签即时更新', regionLabel === '华东', regionLabel)
  await page.screenshot({ path: resolve(out, 'region-switched.png') })

  // 滚动页面，面板保持不动（fixed）
  await page.evaluate(() => window.scrollTo(0, 600))
  await sleep(300)
  const afterScroll = await page.evaluate(() => {
    const el = document.querySelector('.info-panel')
    return el ? el.getBoundingClientRect().top : null
  })
  check('滚动后面板位置不变', afterScroll !== null && Math.abs(afterScroll - panel.rectTop) < 1, { before: panel.rectTop, after: afterScroll })

  // Escape 关闭
  await page.keyboard.press('Escape')
  await sleep(300)
  check('Escape 收起信息栏', await page.evaluate(() => !document.querySelector('.info-panel')))

  check('浏览器无错误', errors.length === 0, errors)
  console.log(`SUMMARY: ${results.filter(r => r.ok).length}/${results.length} passed`)
} finally { await browser.close() }
process.exitCode = results.filter(r => r.ok).length === results.length ? 0 : 1
