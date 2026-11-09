import type { ECharts } from 'echarts'

const DURATION = 440
const SOFT = 18
const clamp = (value: number) => Math.max(0, Math.min(1, value))
const inOut = (value: number) => value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2

/**
 * 柱状 / 折线切换时的一次性擦除：旧图快照盖在画布上，随新图形绘制的方向
 * 从左到右被抹掉，露出下方的新样式。轴和文字保持清晰，也不会出现两种图形叠影。
 */
export class ChartSweep {
  private host: HTMLElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private snapshot: HTMLCanvasElement | null = null
  private raf = 0
  private start = 0
  private supported = typeof CSS !== 'undefined' && CSS.supports?.('mask-image', 'linear-gradient(#000, #000)') !== false

  constructor(host: HTMLElement) {
    this.host = host
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'chart-sweep'
    this.canvas.setAttribute('aria-hidden', 'true')
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3;'
    this.ctx = this.canvas.getContext('2d')!
  }

  play(chart: ECharts) {
    const source = chart.getDom().querySelector('canvas')
    if (!source) return
    this.finish()

    const snapshot = document.createElement('canvas')
    snapshot.width = source.width
    snapshot.height = source.height
    const snapshotCtx = snapshot.getContext('2d')!
    // 先铺一块与卡片一致的底色：只盖住图形本身会让新样式从旧图的透明区域漏出来
    const panel = this.host.closest('.panel, .card') as HTMLElement | null
    const panelBg = panel ? getComputedStyle(panel).backgroundColor : ''
    snapshotCtx.fillStyle = panelBg && panelBg !== 'rgba(0, 0, 0, 0)' ? panelBg : '#fff'
    snapshotCtx.fillRect(0, 0, snapshot.width, snapshot.height)
    snapshotCtx.drawImage(source, 0, 0)
    this.snapshot = snapshot
    this.canvas.width = source.width
    this.canvas.height = source.height

    if (!this.canvas.isConnected) this.host.appendChild(this.canvas)
    this.canvas.style.display = 'block'
    this.canvas.style.opacity = '1'
    this.applyMask(-SOFT)
    this.ctx.drawImage(snapshot, 0, 0)
    this.start = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  private applyMask(position: number) {
    if (!this.supported) {
      this.canvas.style.maskImage = ''
      return
    }
    const mask = `linear-gradient(90deg, rgba(0,0,0,0) ${position}%, #000 ${position + SOFT}%, #000 100%)`
    this.canvas.style.maskImage = mask
    ;(this.canvas.style as any).webkitMaskImage = mask
  }

  private frame = (now: number) => {
    const progress = clamp((now - this.start) / DURATION)
    const eased = inOut(progress)
    if (this.supported) {
      this.applyMask(-SOFT + eased * (100 + SOFT))
    } else {
      this.canvas.style.opacity = String(1 - eased)
    }
    if (progress < 1) this.raf = requestAnimationFrame(this.frame)
    else this.finish()
  }

  finish() {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.snapshot = null
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.canvas.style.display = 'none'
    this.applyMask(100)
  }

  dispose() {
    this.finish()
    this.canvas.remove()
  }
}
