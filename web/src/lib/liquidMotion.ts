import type { ECharts, EChartsOption } from 'echarts'
import Circle from 'zrender/lib/graphic/shape/Circle.js'
import { morphPath } from 'zrender/lib/tool/morphPath.js'

export type LiquidKind = 'line' | 'bar' | 'ticks' | 'scatter' | 'heatmap' | 'ring'
export const LIQUID_DURATION = 760
let filterSequence = 0

export function liquidKind(option: EChartsOption): LiquidKind {
  const series = (Array.isArray(option.series) ? option.series : [option.series]).filter(Boolean) as any[]
  if (series.some(s => s.id === 'dot-heat' || s.type === 'heatmap')) return 'heatmap'
  if (series.some(s => s.id === 'tick-rows')) return 'ticks'
  if (series.some(s => s.id === 'utilization-histogram' || s.type === 'bar')) return 'bar'
  if (series.some(s => s.type === 'pie')) return 'ring'
  if (series.some(s => /scatter/i.test(s.type))) return 'scatter'
  return 'line'
}

function isSeries(element: any) {
  for (let node = element; node; node = node.parent) {
    if (node.__ecComponentInfo) return node.__ecComponentInfo.mainType === 'series'
  }
  return false
}
const paints = (color: unknown) => color && color !== 'none' && color !== 'transparent' && !/rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(String(color))

/** Morph the actual ECharts paths. There is no screenshot or substitute chart to swap out.
 * Adapter is deliberately pinned to ECharts 5.5.1 / ZRender 5.6.0.
 */
export class LiquidChartMotion {
  private restore: (() => void)[] = []
  private timer = 0
  private frame = 0
  private filterSvg: SVGSVGElement
  private blur: SVGFEGaussianBlurElement
  private matrix: SVGFEColorMatrixElement
  private surface: HTMLElement
  private filterId: string
  private media = window.matchMedia('(prefers-reduced-motion: reduce)')
  private complete: (() => void) | null = null
  private onPreference = () => { if (this.media.matches) this.finish() }
  private onHidden = () => { if (document.hidden) this.finish() }

  constructor(private chart: ECharts, private host: HTMLElement) {
    this.surface = host.querySelector<HTMLElement>('.chart-surface') ?? host
    this.filterId = `chart-liquid-${++filterSequence}`
    this.filterSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    this.filterSvg.setAttribute('aria-hidden', 'true')
    this.filterSvg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none'
    this.filterSvg.innerHTML = `<defs><filter id="${this.filterId}" x="-10%" y="-20%" width="120%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="0"/><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/></filter></defs>`
    this.blur = this.filterSvg.querySelector('feGaussianBlur')!
    this.matrix = this.filterSvg.querySelector('feColorMatrix')!
    host.appendChild(this.filterSvg)
    this.media.addEventListener('change', this.onPreference)
    document.addEventListener('visibilitychange', this.onHidden)
  }

  get running() { return this.restore.length > 0 }

  play(kind: LiquidKind, done?: () => void, duration = LIQUID_DURATION) {
    this.finish()
    this.complete = done ?? null
    const bounds = this.host.getBoundingClientRect()
    if (this.media.matches || document.hidden || bounds.top >= innerHeight || bounds.bottom <= 0) {
      this.finish()
      return
    }
    const zr = this.chart.getZr()
    const width = this.chart.getWidth(), height = this.chart.getHeight()
    const elements = [...zr.storage.getDisplayList(true)] as any[]
    const ink = getComputedStyle(this.host).getPropertyValue('--primary').trim() || '#334eac'
    this.host.dataset.liquidState = 'morphing'
    this.host.dataset.liquidKind = kind
    this.surface.style.filter = `url(#${this.filterId})`
    const start = performance.now()
    const soften = () => {
      const t = Math.min(1, (performance.now() - start) / (duration * .72))
      const strength = (1 - t) ** 2
      this.blur.setAttribute('stdDeviation', String(2.4 * strength))
      this.matrix.setAttribute('values', `1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 ${1 + 12 * strength} ${-5 * strength}`)
      if (t < 1) this.frame = requestAnimationFrame(soften)
      else this.surface.style.removeProperty('filter')
    }
    soften()
    let index = 0
    for (const element of elements) {
      if (element.ignore || element.invisible || !element.style) continue
      element.stopAnimation(null, true)
      const style = { ...element.style }
      const buildPath = element.buildPath, updateTransform = element.updateTransform
      this.restore.push(() => {
        element.stopAnimation()
        element.useStyle({ ...style })
        if (buildPath) {
          element.buildPath = buildPath
          element.updateTransform = updateTransform
          element.__mOriginal_buildPath = null
          element.__mOriginal_updateTransform = null
          element.__morphT = -1
          element.updateTransform()
          element.dirtyShape()
        }
      })
      const path = typeof buildPath === 'function' && isSeries(element)
        && (paints(style.fill) || paints(style.stroke)) && (style.opacity ?? 1) > 0
      if (!path) {
        // Labels, grid and annotations stay in their final positions throughout.
        element.setStyle('opacity', 0)
        element.animateTo({ style: { opacity: style.opacity ?? 1 } }, { duration: duration * .4, delay: duration * .34, easing: 'cubicOut' })
        continue
      }
      const rect = element.getBoundingRect().clone()
      if (element.transform) rect.applyTransform(element.transform)
      const tx = rect.x + rect.width / 2, ty = rect.y + rect.height / 2
      const seed = index++
      const angle = seed * 2.399963
      let cx = width * .5 + Math.cos(angle) * 9
      let cy = height * .5 + Math.sin(angle) * 5
      let radius = 3.5 + (seed % 3) * 1.4
      if (kind === 'line') {
        cx += (tx / width - .5) * 42
        cy += Math.sin(tx / width * Math.PI * 2) * 5
      } else if (kind === 'bar') {
        cx += (tx / width - .5) * 32
        cy += 16
      } else if (kind === 'ticks') {
        cx -= 18
        cy += (ty / height - .5) * 28
      } else if (kind === 'ring') {
        cx = width * .5 + Math.cos(angle) * 9
        cy = height * .48 + Math.sin(angle) * 9
        radius = 12
      } else if (kind === 'heatmap') {
        cx += (tx / width - .5) * 18
        cy += (ty / height - .5) * 12
      }
      const source = new Circle({ shape: { cx, cy, r: radius } })
      const delay = Math.round(Math.max(0, Math.min(1, tx / width)) * duration * .105)
      morphPath(source, element, { duration: duration - delay, delay, easing: 'cubicInOut' })
      element.setStyle({
        fill: paints(style.fill) && typeof style.fill === 'string' ? ink : style.fill,
        stroke: paints(style.stroke) ? ink : style.stroke,
        lineWidth: paints(style.stroke) ? Math.max(3, style.lineWidth ?? 1) : style.lineWidth,
        opacity: Math.min(style.opacity ?? 1, .88),
      })
      element.animateTo({ style: {
        fill: style.fill, stroke: style.stroke, lineWidth: style.lineWidth ?? 1, opacity: style.opacity ?? 1,
      } }, { duration: duration - delay, delay, easing: 'cubicInOut' })
    }
    this.host.dataset.liquidPaths = String(index)
    zr.refreshImmediately()
    this.timer = window.setTimeout(() => this.finish(), duration + 40)
  }

  finish() {
    window.clearTimeout(this.timer)
    cancelAnimationFrame(this.frame)
    this.surface.style.removeProperty('filter')
    this.restore.splice(0).forEach(restore => restore())
    this.host.dataset.liquidState = 'ready'
    if (!this.chart.isDisposed()) this.chart.getZr().refreshImmediately()
    const done = this.complete
    this.complete = null
    done?.()
  }

  dispose() {
    this.finish()
    this.media.removeEventListener('change', this.onPreference)
    document.removeEventListener('visibilitychange', this.onHidden)
    this.filterSvg.remove()
  }
}
