import type { ECharts } from 'echarts'

type View = 'strip' | 'users'
type Point = { x: number; y: number; alpha: number; color: string; key: string }
type Rail = { key: string; x1: number; y1: number; x2: number; y2: number; color: string; width: number; alpha: number; dash: number[] }
type Frame = { points: Point[]; rails: Rail[] }
type Grain = { from: Point; to: Point; bx: number; by: number; delay: number }
type RailPair = { from: Rail; to: Rail }
type Hidden = { el: any; ignore: boolean }

const DURATION = 540 // Glyph breakup + spatial reassignment + reassembly share one short timeline.
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (value: number) => Math.max(0, Math.min(1, value))
const out = (value: number) => 1 - (1 - value) ** 3
const inOut = (value: number) => value < .5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2
function groupPoints(points: Point[]) {
  const result = new Map<string, Point[]>()
  for (const point of points) {
    const group = result.get(point.key) ?? []
    group.push(point); result.set(point.key, group)
  }
  return result
}
const noise = (index: number, seed: number) => {
  const value = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453
  return value - Math.floor(value)
}
const transform = (x: number, y: number, matrix?: number[]) => matrix
  ? { x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5] }
  : { x, y }

/** Local adapter for the pinned ECharts 5.5 / ZRender display list. Never hide data symbols. */
function componentOf(element: any) {
  for (let node = element; node; node = node.parent) {
    if (node.__ecComponentInfo) return node.__ecComponentInfo.mainType as string
  }
  return ''
}

export class ScatterMotion {
  private root: HTMLElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private chart: ECharts | null = null
  private hidden: Hidden[] = []
  private labels: { el: HTMLElement; opacity: string }[] = []
  private frameId = 0
  private current: Frame | null = null
  private source: Frame | null = null
  private observer: ResizeObserver
  private width = 0
  private height = 0
  private preparedSize = ''
  private disposed = false
  private generation = 0
  private visibility = () => { if (document.hidden) this.finish() }

  constructor(root: HTMLElement) {
    this.root = root
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'scatter-motion-layer'
    this.canvas.setAttribute('aria-hidden', 'true')
    this.canvas.style.cssText = 'position:absolute;inset:0;z-index:4;pointer-events:none;width:100%;height:100%;display:none;'
    root.appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d')!
    this.observer = new ResizeObserver(() => {
      if (this.current && this.preparedSize !== `${root.clientWidth}:${root.clientHeight}`) this.finish()
    })
    this.observer.observe(root)
    document.addEventListener('visibilitychange', this.visibility)
  }

  private raster(bounds: { x: number; y: number; width: number; height: number }, draw: (ctx: CanvasRenderingContext2D) => void, key: string): Point[] {
    const pad = 3, x = Math.floor(bounds.x) - pad, y = Math.floor(bounds.y) - pad
    const width = Math.max(1, Math.ceil(bounds.width) + pad * 2), height = Math.max(1, Math.ceil(bounds.height) + pad * 2)
    if (width > 1800 || height > 160) return []
    const buffer = document.createElement('canvas')
    buffer.width = width; buffer.height = height
    const ctx = buffer.getContext('2d', { willReadFrequently: true })!
    ctx.translate(-x, -y)
    draw(ctx)
    const pixels = ctx.getImageData(0, 0, width, height).data
    const points: Point[] = []
    for (let py = 0; py < height; py += 2) for (let px = 0; px < width; px += 2) {
      const i = (py * width + px) * 4
      if (pixels[i + 3] < 36) continue
      points.push({ x: x + px, y: y + py, alpha: pixels[i + 3] / 255, color: `rgb(${pixels[i]},${pixels[i + 1]},${pixels[i + 2]})`, key })
    }
    return points
  }

  private domGlyphs(el: HTMLElement, key: string): Point[] {
    const box = el.getBoundingClientRect(), rootBox = this.root.getBoundingClientRect(), style = getComputedStyle(el)
    const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    return this.raster({ x: box.x - rootBox.x, y: box.y - rootBox.y, width: box.width, height: box.height }, ctx => {
      ctx.font = font; ctx.fillStyle = style.color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
      const descent = ctx.measureText('国Mg').fontBoundingBoxDescent ?? parseFloat(style.fontSize) * .2
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        let offset = 0
        for (const char of node.textContent ?? '') {
          const range = document.createRange()
          range.setStart(node, offset); offset += char.length; range.setEnd(node, offset)
          const rect = range.getBoundingClientRect()
          if (char.trim() && rect.width) ctx.fillText(char, rect.x - rootBox.x, rect.bottom - rootBox.y - descent)
        }
      }
    }, key)
  }

  private capture(chart: ECharts, view: View): { frame: Frame; elements: any[] } {
    const rootBox = this.root.getBoundingClientRect()
    const chartBox = chart.getDom().getBoundingClientRect()
    const dx = chartBox.x - rootBox.x, dy = chartBox.y - rootBox.y
    const points: Point[] = [], rails: Rail[] = [], elements: any[] = []
    for (const [selector, key] of [['.panel-title', 'title'], ['.panel-sub', 'subtitle']]) {
      const el = this.root.querySelector<HTMLElement>(selector)
      if (el) points.push(...this.domGlyphs(el, key))
    }
    // The display list already contains final axis coordinates: axis / marker animation is disabled locally.
    const list = (chart.getZr() as any).storage.getDisplayList(true) as any[]
    for (const el of list) {
      if (el.ignore || el.invisible) continue
      if (el.type === 'tspan' && el.style?.text !== undefined) {
        const style = el.style, rect = el.getBoundingRect(), matrix = el.getComputedTransform?.() ?? el.transform
        const corners = [transform(rect.x, rect.y, matrix), transform(rect.x + rect.width, rect.y, matrix), transform(rect.x, rect.y + rect.height, matrix), transform(rect.x + rect.width, rect.y + rect.height, matrix)]
        const xs = corners.map(p => p.x + dx), ys = corners.map(p => p.y + dy)
        const text = String(style.text)
        const key = text.endsWith('%') ? `percent:${text}` : text === '预警' || text === '拥塞' ? `threshold:${text}` : 'axis-other'
        points.push(...this.raster({ x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }, ctx => {
          ctx.translate(dx, dy)
          if (matrix) ctx.transform(...matrix as [number, number, number, number, number, number])
          ctx.font = style.font ?? '11px sans-serif'; ctx.fillStyle = typeof style.fill === 'string' ? style.fill : '#778399'
          ctx.textAlign = style.textAlign ?? 'left'; ctx.textBaseline = style.textBaseline ?? 'alphabetic'
          ctx.fillText(text, style.x ?? 0, style.y ?? 0)
        }, key))
        elements.push(el)
      }
      const shape = el.shape, component = componentOf(el)
      if (!shape || ![shape.x1, shape.x2, shape.y1, shape.y2].every(Number.isFinite)) continue
      const isAxis = component === 'xAxis' || component === 'yAxis'
      const isThreshold = el.style?.stroke === '#d97a00' || el.style?.stroke === '#dc2f2f'
      if (!isAxis && !isThreshold) continue
      const start = transform(shape.x1, shape.y1, el.getComputedTransform?.() ?? el.transform)
      const end = transform(shape.x2, shape.y2, el.getComputedTransform?.() ?? el.transform)
      const semantic = component === (view === 'strip' ? 'xAxis' : 'yAxis') ? 'percent' : 'users'
      rails.push({ key: isThreshold ? `threshold:${el.style.stroke}` : `${semantic}:${el.anid ?? el.id}`, x1: start.x + dx, y1: start.y + dy, x2: end.x + dx, y2: end.y + dy, color: el.style.stroke ?? '#eef2f8', width: el.style.lineWidth ?? 1, alpha: el.style.opacity ?? 1, dash: Array.isArray(el.style.lineDash) ? el.style.lineDash : [] })
      elements.push(el)
    }
    // Bounded work even with long translated headings or high-density fonts.
    const limited = points.length > 2200 ? points.filter((_, index) => index % Math.ceil(points.length / 2200) === 0) : points
    return { frame: { points: limited, rails }, elements }
  }

  private conceal(elements: any[]) {
    for (const el of elements) { this.hidden.push({ el, ignore: el.ignore }); el.ignore = true; el.dirty?.() }
    for (const selector of ['.panel-title', '.panel-sub']) {
      const el = this.root.querySelector<HTMLElement>(selector)
      if (el) { this.labels.push({ el, opacity: el.style.opacity }); el.style.opacity = '0' }
    }
    this.chart?.getZr().refreshImmediately()
  }

  private reveal() {
    for (const { el, ignore } of this.hidden) { el.ignore = ignore; el.dirty?.() }
    for (const { el, opacity } of this.labels) el.style.opacity = opacity
    this.hidden = []; this.labels = []
    if (this.chart && !this.chart.isDisposed()) this.chart.getZr().refreshImmediately()
  }

  prepare(chart: ECharts, view: View) {
    if (this.disposed) return
    this.generation++
    cancelAnimationFrame(this.frameId)
    const continuing = this.current
    this.reveal()
    this.chart = chart
    const captured = this.capture(chart, view)
    this.source = continuing ?? captured.frame
    this.current = this.source
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    this.width = this.root.clientWidth; this.height = this.root.clientHeight
    this.preparedSize = `${this.width}:${this.height}`
    this.canvas.width = Math.round(this.width * ratio); this.canvas.height = Math.round(this.height * ratio)
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    this.canvas.style.display = 'block'
    this.root.dataset.motion = 'running'
    this.root.dataset.motionProgress = '0'
    this.conceal(captured.elements)
    this.paint(this.source)
  }

  commit(chart: ECharts, view: View) {
    if (!this.source || this.disposed) return
    this.reveal()
    ;(chart.getZr() as any).flush()
    const target = this.capture(chart, view)
    this.chart = chart
    this.conceal(target.elements)
    const sourceGroups = groupPoints(this.source.points)
    const targetGroups = groupPoints(target.frame.points)
    const grains: Grain[] = []
    for (const key of new Set([...sourceGroups.keys(), ...targetGroups.keys()])) {
      const from = sourceGroups.get(key) ?? [], to = targetGroups.get(key) ?? []
      const count = Math.max(from.length, to.length)
      for (let i = 0; i < count; i++) {
        const a = from[Math.floor(i / count * from.length)] ?? { ...to[Math.floor(i / count * to.length)], alpha: 0 }
        const b = to[Math.floor(i / count * to.length)] ?? { ...a, alpha: 0 }
        const angle = noise(i, key.length) * Math.PI * 2
        const drift = key.startsWith('percent:') ? 8 : 8 + noise(i, 2) * 14
        grains.push({ from: a, to: b, bx: a.x + Math.cos(angle) * drift, by: a.y + Math.sin(angle) * drift * .7, delay: noise(i, 3) * .08 })
      }
    }
    const oldRails = new Map(this.source.rails.map(rail => [rail.key, rail]))
    const newRails = new Map(target.frame.rails.map(rail => [rail.key, rail]))
    const railPairs: RailPair[] = [...new Set([...oldRails.keys(), ...newRails.keys()])].map(key => {
      const before = oldRails.get(key), after = newRails.get(key)
      return { from: before ?? { ...after!, alpha: 0 }, to: after ?? { ...before!, alpha: 0 } }
    })
    const version = this.generation, start = performance.now()
    this.root.dataset.motionParticles = String(grains.length)
    const draw = (now: number) => {
      if (this.disposed || version !== this.generation) return
      const progress = clamp((now - start) / DURATION)
      const frame: Frame = { points: [], rails: [] }
      for (const grain of grains) {
        const t = clamp((progress - grain.delay) / (1 - grain.delay))
        const burst = out(clamp(t / .26)), gather = inOut(clamp((t - .26) / .74))
        const sx = mix(grain.from.x, grain.bx, burst), sy = mix(grain.from.y, grain.by, burst)
        frame.points.push({ x: mix(sx, grain.to.x, gather), y: mix(sy, grain.to.y, gather), alpha: mix(grain.from.alpha, grain.to.alpha, gather) * (1 - Math.sin(t * Math.PI) * .22), color: gather < .5 ? grain.from.color : grain.to.color, key: grain.to.key })
      }
      const railT = inOut(clamp((progress - .04) / .88))
      for (const { from, to } of railPairs) frame.rails.push({ ...to, x1: mix(from.x1, to.x1, railT), y1: mix(from.y1, to.y1, railT), x2: mix(from.x2, to.x2, railT), y2: mix(from.y2, to.y2, railT), alpha: mix(from.alpha, to.alpha, railT) })
      this.current = frame
      this.root.dataset.motionProgress = progress.toFixed(3)
      this.paint(frame)
      if (progress < 1) this.frameId = requestAnimationFrame(draw)
      else this.finish()
    }
    this.frameId = requestAnimationFrame(draw)
  }

  private paint(frame: Frame) {
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.width, this.height)
    for (const rail of frame.rails) {
      ctx.globalAlpha = rail.alpha; ctx.strokeStyle = rail.color; ctx.lineWidth = rail.width
      ctx.setLineDash(rail.dash); ctx.beginPath(); ctx.moveTo(rail.x1, rail.y1); ctx.lineTo(rail.x2, rail.y2); ctx.stroke()
    }
    ctx.setLineDash([])
    for (const point of frame.points) {
      ctx.globalAlpha = point.alpha; ctx.fillStyle = point.color; ctx.fillRect(point.x - .1, point.y - .1, 1.55, 1.55)
    }
    ctx.globalAlpha = 1
  }

  finish() {
    this.generation++
    cancelAnimationFrame(this.frameId)
    this.reveal()
    this.current = null; this.source = null
    this.ctx.clearRect(0, 0, this.width, this.height)
    this.canvas.style.display = 'none'
    delete this.root.dataset.motion
    delete this.root.dataset.motionProgress
    delete this.root.dataset.motionParticles
  }

  dispose() {
    this.finish()
    this.disposed = true
    this.observer.disconnect()
    document.removeEventListener('visibilitychange', this.visibility)
    this.canvas.remove()
    this.chart = null
  }
}
