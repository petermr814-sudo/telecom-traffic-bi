import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import puppeteer from 'puppeteer-core'

const base = process.env.SHOT_BASE || 'http://127.0.0.1:5178/'
const out = resolve('../docs/map-check')
await mkdir(out, { recursive: true })
const dataset = JSON.parse(await readFile('public/data/dataset.json', 'utf8'))
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1600, height: 1100 } })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
const sleep = ms => new Promise(r => setTimeout(r, ms))
let checks = 0
function check(name, value, detail = '') { assert.ok(value, `${name}: ${detail}`); checks++; console.log('PASS', name) }

async function readCharts() {
  return page.evaluate(() => {
    const root = document.querySelector('.city-analysis')
    const charts = [...root.querySelectorAll('.chart-box')].map(box => {
      const chart = box.__chart
      const series = chart.getModel().getSeriesByIndex(0)
      const shapes = [], active = []
      chart.getViewOfSeriesModel(series).group.traverse(el => {
        if (['ec-polyline', 'sector', 'rect'].includes(el.type)) {
          shapes.push({ type: el.type, shape: JSON.parse(JSON.stringify(el.shape)) })
          if (el.animators?.some(animator => animator.getClip())) active.push(el.type)
        }
      })
      return { id: chart.id, enabled: chart.getOption().animation, seriesId: series.id, shapes, active }
    })
    const bounds = [...root.querySelectorAll('.panel')].map(el => ({ width: el.clientWidth, height: el.clientHeight }))
    const blurs = root.getAnimations({ subtree: true }).filter(animation => animation.effect.getKeyframes().some(frame => String(frame.filter).includes('blur('))).length
    const titleWidths = [...root.querySelectorAll('.panel-title > span:last-child')].map(el => el.getBoundingClientRect().width)
    const textSizesStable = [...root.querySelectorAll('[data-text-reveal-char]')].every(el => getComputedStyle(el).fontSize === getComputedStyle(el.parentElement).fontSize)
    return { charts, bounds, blurs, titleWidths, textSizesStable, city: root.dataset.city, heading: root.querySelector('h3').textContent, text: root.textContent, fragments: root.querySelectorAll('[data-text-reveal-char]').length }
  })
}
async function select(city) {
  await page.evaluate(name => {
    const root = document.querySelector('.traffic-explorer')
    root.__vueParentComponent.setupState.selectCity(name)
  }, city)
}
function shapesChanged(a, b) { return JSON.stringify(a.shapes) !== JSON.stringify(b.shapes) }
try {
  await page.goto(`${base}#/region`, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => !document.querySelector('.scene-message'))
  await page.evaluate(() => document.querySelector('.city-row[data-city="桂林"]').click())
  await page.waitForFunction(() => [...document.querySelectorAll('.city-analysis .chart-box')].length === 3 && [...document.querySelectorAll('.city-analysis .chart-box')].every(el => el.__chart))
  await sleep(500)
  await page.$eval('.city-analysis', el => el.scrollIntoView({ block: 'center' }))
  const initial = await readCharts()
  check('All three city charts explicitly enable data animation', initial.charts.every(chart => chart.enabled))
  check('All chart series have stable identifiers', initial.charts.map(c => c.seriesId).join(',') === 'city-load-trend,city-network-structure,city-cell-ranking')
  await select('深圳')
  await sleep(45)
  const middle = await readCharts()
  check('City changes keep all chart instances alive', middle.charts.every((chart, i) => chart.id === initial.charts[i].id))
  check('Line, ring and bars have active shape animations', middle.charts.every(chart => chart.active.length > 0), JSON.stringify(middle.charts.map(c => c.active)))
  check('Headings and values reuse Gaussian text animation', middle.blurs > 0 && middle.fragments > 0)
  check('Chart cards hold their dimensions during transition', JSON.stringify(initial.bounds) === JSON.stringify(middle.bounds))
  check('Gaussian text preserves title spacing and numeric font size', middle.textSizesStable && middle.titleWidths.every((width, i) => Math.abs(width - initial.titleWidths[i]) < 1))
  await (await page.$('.city-analysis')).screenshot({ path: resolve(out, 'city-analysis-transition.png') })
  await sleep(400)
  const final = await readCharts()
  check('Every chart progresses from its intermediate shape', final.charts.every((chart, i) => shapesChanged(chart, middle.charts[i])))
  check('Text restores to clean nodes after transition', final.blurs === 0 && final.fragments === 0 && final.heading === '深圳 · 网络运行画像')
  const actual = await page.evaluate(() => {
    const charts = [...document.querySelectorAll('.city-analysis .chart-box')].map(el => el.__chart.getOption())
    return { trend: charts[0].series[0].data, traffic: charts[1].series[0].data.reduce((s, item) => s + item.value, 0), top: charts[2].series[0].data.map(item => item.value) }
  })
  const cells = dataset.cells.filter(c => c.city === '深圳')
  const capacity = cells.reduce((s, cell) => s + cell.bandwidthMbps, 0)
  check('Animated charts finish at the exact selected city data', actual.traffic === cells.reduce((s, cell) => s + cell.trafficBytes, 0) && actual.trend.every((v, i) => Math.abs(v - cells.reduce((s, cell) => s + cell.trend[i] * cell.bandwidthMbps, 0) / capacity) < .051) && actual.top.every((v, i) => v === cells.map(c => c.trafficBytes).sort((a, b) => b - a)[i]))
  await select('上海')
  await sleep(35)
  await select('成都')
  await sleep(35)
  await select('桂林')
  await sleep(420)
  const rapid = await readCharts()
  check('Rapid changes settle on the latest city without old text', rapid.city === '桂林' && rapid.heading === '桂林 · 网络运行画像' && rapid.fragments === 0 && !rapid.text.includes('深圳') && !rapid.text.includes('上海') && !rapid.text.includes('成都'))
  check('Rapid changes do not remount charts', rapid.charts.every((chart, i) => chart.id === initial.charts[i].id))
  await (await page.$('.city-analysis')).screenshot({ path: resolve(out, 'city-analysis-settled.png') })
  await page.evaluate(() => document.querySelectorAll('.city-analysis .chart-box')[2].__chart.trigger('click', { dataIndex: 0 }))
  await page.waitForSelector('[role="dialog"][aria-modal="true"]')
  check('Updated top cell still opens the latest city detail', await page.$eval('[role="dialog"][aria-modal="true"]', el => el.textContent.includes('桂林')))
  await page.keyboard.press('Escape')
  await sleep(350)
  await select('北京')
  await sleep(35)
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await sleep(80)
  const reduced = await readCharts()
  check('Reduced-motion change cancels text and chart movement', reduced.blurs === 0 && reduced.fragments === 0 && reduced.charts.every(chart => !chart.enabled))
  await select('深圳')
  await sleep(80)
  check('Reduced-motion city changes show the latest data immediately', (await readCharts()).city === '深圳' && (await readCharts()).blurs === 0)
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
  for (const width of [1280, 768, 390]) {
    await page.setViewport({ width, height: 1000 })
    await sleep(350)
    check(`Three charts fit ${width}px viewport`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('.city-analysis .chart-box')].every(el => el.clientWidth > 100)))
  }
  await select('杭州')
  await page.goto(`${base}#/overview`, { waitUntil: 'networkidle0' })
  check('Leaving mid-transition removes temporary text fragments', await page.$$eval('.city-analysis [data-text-reveal-char]', els => els.length === 0))
  check('No browser errors', errors.length === 0, JSON.stringify(errors))
  console.log(`SUMMARY ${checks}/${checks}`)
} finally { await browser.close() }
