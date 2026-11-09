import puppeteer from 'puppeteer-core'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const base = process.env.SHOT_BASE || 'http://127.0.0.1:5400/'
const out = resolve('../docs/map-check')
await mkdir(out, { recursive: true })
const ds = JSON.parse(await readFile('public/data/dataset.json', 'utf8'))
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1600, height: 1100 } })
const page = await browser.newPage()
const errors = []
const results = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
const sleep = ms => new Promise(r => setTimeout(r, ms))
function check(name, ok, detail = '') { results.push({ name, ok }); console.log(ok ? 'PASS' : 'FAIL', name, detail) }
async function ready() { await page.waitForSelector('.traffic-scene canvas'); await page.waitForFunction(() => !document.querySelector('.scene-message')); await sleep(500) }
async function settled(city) { await page.waitForFunction(c => { const el = document.querySelector('.traffic-scene'); return el?.dataset.view === c && el.dataset.moving === 'false' && el.dataset.terrain === c }, {}, city) }
async function selectCity(city) { await page.evaluate(name => document.querySelector(`.city-row[data-city="${name}"]`).click(), city); await settled(city) }
async function switchCity(city) {
  // The city switcher is the custom Select listbox (teleported to body), not a native select.
  await page.click('button[aria-label="切换城市"]')
  await page.waitForSelector('.sel__menu .sel__option', { visible: true })
  await page.evaluate(name => {
    const option = [...document.querySelectorAll('.sel__menu .sel__option')].find(el => el.textContent.trim().startsWith(name))
    if (!option) throw new Error(`切换城市下拉中找不到 ${name}`)
    option.click()
  }, city)
}
try {
  await page.goto(`${base}#/region`, { waitUntil: 'networkidle0' })
  await ready()
  check('3D canvas and all 60 city entries', await page.$$eval('.city-row', els => els.length === 60))
  await page.screenshot({ path: resolve(out, 'national.png'), fullPage: true })
  // Click the visible map label, rather than only driving the city list.
  // The national camera pose hides some pins by collision avoidance, so pick any visible one.
  const pinCity = await page.evaluate(() => {
    const pin = [...document.querySelectorAll('.city-pin')].find(p => !p.hidden)
    if (!pin) throw new Error('no visible city pin')
    pin.click()
    return pin.dataset.city
  })
  await sleep(140)
  check('City click starts camera flight', await page.$eval('.traffic-scene', el => el.dataset.moving === 'true'))
  await settled(pinCity)
  await page.waitForFunction(() => [...document.querySelectorAll('.city-analysis .chart-box')].length === 3 && [...document.querySelectorAll('.city-analysis .chart-box')].every(el => el.__chart))
  check('Three detail charts render', await page.$$eval('.city-analysis .chart-box', els => els.every(el => el.__chart.getOption().series.length)))
  const expected = ds.cells.filter(c => c.city === pinCity).reduce((s, c) => s + c.trafficBytes, 0)
  const actual = await page.evaluate(() => document.querySelectorAll('.city-analysis .chart-box')[1].__chart.getOption().series[0].data.reduce((s, d) => s + d.value, 0))
  check('City traffic reconciles with cell dataset', Math.abs(actual - expected) < 1, `${pinCity} ${String(actual)} vs ${expected}`)
  await page.screenshot({ path: resolve(out, `${pinCity}.png`), fullPage: true })
  await switchCity('上海')
  await sleep(180)
  await switchCity('深圳')
  await settled('深圳')
  check('Rapid switching ends at last city', await page.$eval('.city-analysis', el => el.dataset.city === '深圳'))
  await page.screenshot({ path: resolve(out, 'shenzhen.png'), fullPage: true })
  await page.evaluate(() => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === '近 7 天').click())
  await sleep(700)
  const ranged = await page.evaluate(() => document.querySelectorAll('.city-analysis .chart-box')[1].__chart.getOption().series[0].data.reduce((s,d) => s + d.value, 0))
  const shenzhen = ds.cells.filter(c => c.city === '深圳').reduce((s,c) => s + c.trafficBytes, 0)
  check('Range filter updates city charts', Math.abs(ranged / shenzhen - 7) < 1e-10)
  await page.click('button[aria-label="返回全国视角"]')
  await settled('national')
  check('Reset returns overview and hides city charts', !(await page.$('.city-analysis')))
  await page.type('input[aria-label="搜索地图城市"]', '杭州')
  check('City search filters results', await page.$$eval('.city-row', els => els.length === 1 && els[0].dataset.city === '杭州'))
  await page.click('.city-row')
  await settled('杭州')
  await page.click('.map-metrics button[data-key="users"]')
  check('Metric switch preserves selected city', await page.$eval('.traffic-scene', el => el.dataset.metric === 'users' && el.dataset.view === '杭州'))
  await page.evaluate(() => { document.querySelectorAll('.city-analysis .chart-box')[2].__chart.trigger('click', { dataIndex: 0 }) })
  await sleep(400)
  check('Top cell opens detail drawer', await page.evaluate(() => document.body.textContent.includes('杭州') && !!document.querySelector('.drawer')))
  await page.keyboard.press('Escape')
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await switchCity('成都')
  await sleep(100)
  check('Reduced motion skips flight', await page.$eval('.traffic-scene', el => el.dataset.moving === 'false' && el.dataset.view === '成都'))
  for (const w of [1280, 768, 390]) {
    await page.setViewport({ width: w, height: 1000 })
    await sleep(500)
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, canvas: document.querySelector('.traffic-scene canvas').getBoundingClientRect().width }))
    check(`Responsive layout at ${w}px`, dimensions.scroll <= dimensions.width + 1 && dimensions.canvas > 100, JSON.stringify(dimensions))
    await page.screenshot({ path: resolve(out, `city-${w}.png`), fullPage: true })
  }
  await page.setViewport({ width: 1600, height: 1100 })
  await page.goto(`${base}#/overview`, { waitUntil: 'networkidle0' })
  await page.goto(`${base}#/region`, { waitUntil: 'networkidle0' })
  await ready()
  check('Map survives route unmount and remount', !!(await page.$('.traffic-scene canvas')))
  await selectCity('广州')
  await page.click('button[aria-label="返回全国视角"]')
  await settled('national')
  await page.setOfflineMode(true)
  await selectCity('广州')
  check('City drilldown works offline after load', await page.$eval('.city-analysis', el => el.dataset.city === '广州'))
  await page.setOfflineMode(false)
  await page.evaluate(() => {
    if (!document.querySelector('.info-panel')) document.querySelector('.info-toggle').click()
  })
  await sleep(250)
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.info-row')].find((el) => el.textContent.includes('当前区域'))
    row?.querySelector('button')?.click()
  })
  await sleep(150)
  await page.evaluate(() => [...document.querySelectorAll('.region-grid__item')].find(el => el.textContent.trim() === '华北').click())
  await settled('national')
  check('Region filter clears an out-of-region city', !(await page.$('.city-analysis')) && await page.$$eval('.city-row', els => els.length > 0 && els.every(el => !['广州', '深圳', '成都'].includes(el.dataset.city))))
  await page.type('input[aria-label="搜索地图城市"]', '不存在的城市')
  check('Empty search gives feedback', await page.$$eval('.city-row', els => els.length === 0) && await page.$eval('.city-empty', el => el.textContent.includes('暂无匹配')))
  await page.click('button[aria-label="清空城市搜索"]')
  const canvas = await page.$('.traffic-scene canvas')
  await canvas.evaluate(el => el.dispatchEvent(new Event('webglcontextlost', { cancelable: true })))
  check('Graphics failure leaves city data usable', await page.$eval('.scene-message', el => el.textContent.includes('中断')))
  await page.click('.city-row[data-city="北京"]')
  await sleep(150)
  check('City details remain usable without 3D', !!(await page.$('.city-analysis[data-city="北京"]')))
  check('No browser errors', errors.length === 0, JSON.stringify(errors))
} finally {
  await browser.close()
  console.log(`SUMMARY ${results.filter(r => r.ok).length}/${results.length}`)
  if (results.some(r => !r.ok) || errors.length) process.exitCode = 1
}
