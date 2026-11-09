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
  const regionSamples = await page.evaluate(async () => {
    const wrap = document.querySelector('.region-grid__collapse')
    const out = []
    const start = performance.now()
    await new Promise(resolve => {
      const tick = () => {
        out.push({ t: performance.now() - start, h: wrap.getBoundingClientRect().height })
        if (performance.now() - start < 450) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
    return out
  })
  const regionHeights = new Set(regionSamples.map(s => Math.round(s.h * 10))).size
  check('区域菜单展开有拉伸动画', regionHeights >= 10 && regionSamples[regionSamples.length - 1].h > 50, { frames: regionHeights, end: regionSamples[regionSamples.length - 1].h })
  const arrowOpen = await page.evaluate(() => {
    const btn = document.querySelector('.info-row__value--btn')
    const svg = btn?.querySelector('svg')
    return {
      expanded: btn?.getAttribute('aria-expanded'),
      transform: svg ? getComputedStyle(svg).transform : '',
      background: btn ? getComputedStyle(btn).backgroundColor : ''
    }
  })
  check('区域按钮展开时箭头旋转且有展开态', arrowOpen.expanded === 'true' && arrowOpen.transform !== 'none' && arrowOpen.background !== 'rgba(0, 0, 0, 0)', arrowOpen)
  await sleep(200)
  await page.evaluate(() => [...document.querySelectorAll('.region-grid__item')].find(el => el.textContent.trim() === '华东').click())
  await sleep(250)
  check('选择区域后面板自动收起', await page.evaluate(() => !document.querySelector('.info-panel')))
  await page.click('.info-toggle')
  await sleep(300)
  const regionLabel = await page.evaluate(() => document.querySelector('.info-row__value--btn')?.textContent?.trim())
  check('区域选择后标签即时更新', regionLabel === '华东', regionLabel)
  const arrowClosed = await page.evaluate(() => {
    const btn = document.querySelector('.info-row__value--btn')
    const svg = btn?.querySelector('svg')
    return { expanded: btn?.getAttribute('aria-expanded'), transform: svg ? getComputedStyle(svg).transform : '' }
  })
  check('区域按钮收起后箭头复位', arrowClosed.expanded === 'false' && arrowClosed.transform === 'none', arrowClosed)

  // 从信息栏跳转告警中心：弹窗打开时面板保留，退出弹窗后面板仍在
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.info-row')].find(el => el.textContent.includes('待处理告警'))
    row?.click()
  })
  await sleep(400)
  check('告警中心在面板上方打开', await page.evaluate(() => Boolean(document.querySelector('.modal')) && Boolean(document.querySelector('.info-panel'))))
  await page.keyboard.press('Escape')
  await sleep(400)
  check('退出告警中心后面板仍在', await page.evaluate(() => !document.querySelector('.modal') && Boolean(document.querySelector('.info-panel'))))

  // 折叠分区的高度拉伸动画：收起时高度平滑变化而非瞬间消失
  await page.evaluate(() => {
    const head = [...document.querySelectorAll('.info-section__head')].find(h => h.textContent.includes('运行状态'))
    head?.click()
  })
  const collapseSamples = await page.evaluate(async () => {
    const wrap = document.querySelector('.info-section__collapse')
    const out = []
    const start = performance.now()
    await new Promise(resolve => {
      const tick = () => {
        out.push({ t: performance.now() - start, h: wrap.getBoundingClientRect().height })
        if (performance.now() - start < 450) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
    return out
  })
  const heights = new Set(collapseSamples.map(s => Math.round(s.h * 10))).size
  check('分区收起有平滑高度动画', heights >= 10 && collapseSamples[collapseSamples.length - 1].h < 2, { frames: heights, end: collapseSamples[collapseSamples.length - 1].h })
  await page.evaluate(() => {
    const head = [...document.querySelectorAll('.info-section__head')].find(h => h.textContent.includes('运行状态'))
    head?.click()
  })
  await sleep(400)
  const reopened = await page.evaluate(() => {
    const wrap = document.querySelector('.info-section__collapse')
    return wrap.getBoundingClientRect().height > 100
  })
  check('分区展开恢复原高度', reopened)

  // 系统「减少动画」偏好下仍平滑拉伸：JS 补间不受全局 CSS transition 归零影响
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await sleep(80)
  await page.evaluate(() => {
    const head = [...document.querySelectorAll('.info-section__head')].find(h => h.textContent.includes('快捷操作'))
    head?.click()
  })
  const reduceSamples = await page.evaluate(async () => {
    const wrap = document.querySelectorAll('.info-section__collapse')[1]
    const out = []
    const start = performance.now()
    await new Promise(resolve => {
      const tick = () => {
        out.push({ t: performance.now() - start, h: wrap.getBoundingClientRect().height })
        if (performance.now() - start < 450) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
    return out
  })
  const reduceHeights = new Set(reduceSamples.map(s => Math.round(s.h * 10))).size
  check('减少动画偏好下仍平滑拉伸', reduceHeights >= 10 && reduceSamples[reduceSamples.length - 1].h < 2, { frames: reduceHeights, end: reduceSamples[reduceSamples.length - 1].h })
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
  await sleep(80)
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
