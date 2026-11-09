import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
const out = resolve('../docs/liquid-loading')
mkdirSync(out, { recursive: true })
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1600, height: 1100 } })
const page = await browser.newPage()
page.on('pageerror', e => console.log('ERROR', e.message))
try {
  await page.goto('http://127.0.0.1:5178/#/loading-motion', { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => document.querySelectorAll('.chart-box').length === 6 && [...document.querySelectorAll('.chart-box')].every(el => el.__chart))
  await new Promise(r => setTimeout(r, 1300))
  console.log(await page.$$eval('.chart-box', els => els.map(el => ({ kind: el.dataset.liquidKind, state: el.dataset.liquidState, paths: el.dataset.liquidPaths, children: el.__chart.getZr().storage.getDisplayList(true).length }))))
  await page.screenshot({ path: resolve(out, 'gallery-ready.png'), fullPage: true })
  await page.$eval('[data-demo="line"]', el => {
    el.scrollIntoView({ block: 'center' })
    el.querySelector('.chart-box').dispatchEvent(new CustomEvent('liquid:replay', { detail: { duration: 2400 } }))
  })
  await new Promise(r => setTimeout(r, 180))
  await (await page.$('[data-demo="line"]')).screenshot({ path: resolve(out, 'line-01-seed.png') })
  await new Promise(r => setTimeout(r, 800))
  await (await page.$('[data-demo="line"]')).screenshot({ path: resolve(out, 'line-02-morph.png') })
  await new Promise(r => setTimeout(r, 1800))
  await (await page.$('[data-demo="line"]')).screenshot({ path: resolve(out, 'line-03-ready.png') })
} finally { await browser.close() }
