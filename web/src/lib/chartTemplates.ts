// Visual adaptations of Lieflat Charts F5, F10 and F14 for the existing ECharts runtime.
// Source: lieflat-charts/templates/basics-gallery.html and color/basics-porcelain.html.
// PolyForm Noncommercial 1.0.0: /third-party/lieflat-charts-LICENSE.txt
import { axisLabel, C, CHART_FONT, splitLine, tooltipBase } from './chart'

export function readableUnit(value: number) {
  if (!(value > 0)) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const mantissa = value / power
  return (mantissa <= 1 ? 1 : mantissa <= 2 ? 2 : mantissa <= 5 ? 5 : 10) * power
}

export interface TickRow {
  name: string
  value: number
  label: string
  detail: string
}

export function tickRowsOption(rows: TickRow[], unit: number) {
  const max = Math.max(unit, ...rows.map(row => row.value))
  return {
    animationDuration: 420,
    grid: { left: 0, right: 66, top: 10, bottom: 8, containLabel: true },
    tooltip: { ...tooltipBase, formatter: (p: any) => `${p.name}<br/><b>${rows[p.dataIndex]?.detail ?? ''}</b>` },
    xAxis: { type: 'value', min: 0, max: Math.ceil(max / unit) * unit, show: false },
    yAxis: {
      type: 'category', inverse: true, data: rows.map(row => row.name),
      axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...axisLabel, margin: 12 },
    },
    series: [{
      id: 'tick-rows', name: '流量', type: 'custom',
      encode: { x: 0, y: 1 },
      data: rows.map((row, index) => ({ name: row.name, value: [row.value, index] })),
      renderItem: (params: any, api: any) => {
        const value = Number(api.value(0)), index = Number(api.value(1))
        const [left, y] = api.coord([0, index])
        const right = api.coord([max, index])[0]
        const step = api.coord([unit, index])[0] - left
        const color = index === 0 ? C.primary : '#7096d1'
        const count = Math.ceil(value / unit)
        const children: any[] = [{ type: 'line', shape: { x1: left, x2: right, y1: y + 8, y2: y + 8 }, style: { stroke: '#e3e9f2', lineWidth: 1 } }]
        for (let k = 0; k < count; k++) {
          const fraction = Math.min(1, Math.max(0, value / unit - k))
          const x = left + (k + .5) * step
          children.push({ type: 'line', shape: { x1: x, x2: x, y1: y + 7, y2: y + 7 - fraction * 15 }, style: { stroke: color, lineWidth: Math.max(1.3, Math.min(2.8, step * .35)) } })
          if ((k + 1) % 5 === 0) children.push({ type: 'circle', shape: { cx: x, cy: y + 12, r: 1 }, style: { fill: '#b0bed0' } })
        }
        children.push({ type: 'text', x: api.coord([value, index])[0] + 9, y,
          style: { text: rows[index]?.label ?? '', fill: index === 0 ? C.text : C.text2, font: `600 12px ${CHART_FONT}`, verticalAlign: 'middle' } })
        children.push({ type: 'rect', shape: { x: left, y: y - 14, width: Math.max(20, params.coordSys.width), height: 30 }, style: { fill: 'rgba(0,0,0,0)' } })
        return { type: 'group', children }
      },
    }],
  } as any
}

export interface HeatAnim {
  /** 标注行（日期下标，0 在底部）；切换日期时直接落位，不做滑动 */
  maskRow: number
  /** 圆环中心的小时下标 */
  ringH: number
  /** 圆环中心的日期下标 */
  ringD: number
  /** 圆环半径系数，等于峰值点 sqrt(value / max) */
  ringVF: number
  /** 笔触不透明度：0=消失，1=完全呈现（旧标注淡出、新标注淡入的载体） */
  ink: number
  /** 划线进度 0→1：下划线与峰值画圈共用同一进度，保证两段绘制同步 */
  draw: number
  /** 1=有选中日期（下划线与行内圆点变淡仅在此时生效） */
  selected: number
}

/** 类目轴 band 坐标线性插值，避免依赖 api.coord 对小数下标的支持 */
function heatBandY(api: any, row: number, lastD: number) {
  const d0 = Math.max(0, Math.min(lastD, Math.floor(row)))
  const d1 = Math.min(lastD, d0 + 1)
  return api.coord([0, d0])[1] + (api.coord([0, d1])[1] - api.coord([0, d0])[1]) * (row - d0)
}

function heatBandXY(api: any, hour: number, row: number, lastH: number, lastD: number) {
  const h0 = Math.max(0, Math.min(lastH, Math.floor(hour)))
  const d0 = Math.max(0, Math.min(lastD, Math.floor(row)))
  const h1 = Math.min(lastH, h0 + 1)
  const d1 = Math.min(lastD, d0 + 1)
  const [x0, y0] = api.coord([h0, d0])
  const x1 = api.coord([h1, d0])[0]
  const y1 = api.coord([h0, d1])[1]
  return [x0 + (x1 - x0) * (hour - h0), y0 + (y1 - y0) * (row - d0)] as const
}

/** 确定性手绘抖动：同一输入恒定输出，逐帧重绘时笔触不闪烁 */
export function handWobble(t: number, seed: number) {
  return Math.sin(t * .9 + seed) * .62 + Math.sin(t * 2.3 + seed * 1.7) * .28 + Math.sin(t * 4.7 + seed * 2.9) * .1
}

interface HandPath {
  points: number[][]
  length: number
}

function pathLength(points: number[][], closed = false) {
  let length = 0
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
  if (closed && points.length > 1) {
    const first = points[0]
    const last = points[points.length - 1]
    length += Math.hypot(first[0] - last[0], first[1] - last[1])
  }
  return length
}

function handLinePoints(x0: number, x1: number, y: number, seed: number, amp = 1.15): HandPath {
  const points: number[][] = []
  const n = Math.max(8, Math.round((x1 - x0) / 26))
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n
    points.push([x, y + handWobble(i * 1.31, seed) * amp])
  }
  return { points, length: pathLength(points) }
}

/** 闭合手绘圆：自顶部起笔顺时针画圈；抖动取角度整数谐波，首尾自然衔接 */
function handRingPoints(cx: number, cy: number, r: number, seed: number, amp = 1.2): HandPath {
  const points: number[][] = []
  const n = 40
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2
    const rr = r + (Math.sin(a * 3 + seed) * .62 + Math.sin(a * 7 + seed * 1.7) * .28 + Math.sin(a * 11 + seed * 2.9) * .1) * amp
    points.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr])
  }
  return { points, length: pathLength(points, true) }
}

export interface HeatAccent { day: number; peakHours: number[]; valleyHours: number[] }

export function dotHeatOption(values: number[][], hours: string[], days: string[], format: (value: number) => string, anim: HeatAnim, accent?: HeatAccent | null) {
  const max = Math.max(1, ...values.map(point => point[2]))
  const lastH = hours.length - 1
  const lastD = days.length - 1
  const ringAnchor = values.length - 1
  return {
    animationDuration: 350,
    grid: { left: 42, right: 20, top: 12, bottom: 30 },
    tooltip: { ...tooltipBase, formatter: (p: any) => `${days[p.value[1]]} ${hours[p.value[0]]}<br/><b>${format(p.value[2])}</b>` },
    xAxis: { type: 'category', data: hours, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...axisLabel, interval: 'auto' }, splitLine: { show: false } },
    yAxis: { type: 'category', data: days, axisLine: { show: false }, axisTick: { show: false }, axisLabel },
    visualMap: { show: false, type: 'continuous', seriesIndex: 0, dimension: 2, min: 0, max, inRange: { color: ['#bad6eb', '#7096d1', '#334eac'] } },
    series: [{
      id: 'dot-heat', type: 'custom', data: values, encode: { x: 0, y: 1, tooltip: 2 },
      // 遮罩与圆环由外部 rAF 补间逐帧驱动；关闭系列自身动画，
      // 避免 replaceMerge 重建系列时每帧重放入场动画造成闪烁
      animation: false,
      renderItem: (params: any, api: any) => {
        const h = Number(api.value(0)), d = Number(api.value(1)), value = Number(api.value(2))
        const [x, y] = api.coord([h, d])
        const width = Math.abs(api.size([1, 0])[0]), height = Math.abs(api.size([0, 1])[1])
        const maxR = Math.min(width * .38, height * .36)
        const radius = maxR * Math.sqrt(value / max)
        const opacity = 1 - .55 * anim.ink * anim.selected * Math.min(1, Math.abs(d - anim.maskRow))
        const isPeak = Boolean(accent && d === accent.day && accent.peakHours.includes(h))
        const isValley = Boolean(accent && d === accent.day && accent.valleyHours.includes(h))
        const fill = value > 0 ? (isPeak ? C.red : isValley ? C.teal : api.visual('color')) : '#dce3ec'
        // 子元素结构逐帧保持不变（普通格 [circle]，锚点格 [circle, polyline, polyline, polygon]）：
        // ECharts 按下标复用元素，结构缺项导致类型错位时 copyElement 会把旧形状并进新元素
        const children: any[] = [
          { type: 'circle', shape: { cx: x, cy: y, r: value > 0 ? radius : 1 }, style: { fill, opacity } },
        ]
        if (params.dataIndex === ringAnchor) {
          // 下划线改为直线；峰值不再画圈，改用红色点表示
          const baseY = heatBandY(api, anim.maskRow, lastD) + height / 2 - 1
          const x0 = params.coordSys.x + 2
          const x1 = params.coordSys.x + params.coordSys.width - 2
          const ghost: HandPath = { points: [[x0, baseY + 1.9], [x1, baseY + 1.9]], length: Math.max(1, x1 - x0) }
          const main: HandPath = { points: [[x0, baseY], [x1, baseY]], length: Math.max(1, x1 - x0) }
          const strokeOf = (path: HandPath, lineWidth: number, alpha: number, gated = true) => ({
            stroke: C.text, lineWidth, fill: 'none', lineCap: 'round', lineJoin: 'round',
            opacity: alpha * anim.ink * (gated ? anim.selected : 1),
            lineDash: [path.length, path.length], lineDashOffset: path.length * (1 - anim.draw),
          })
          children.push(
            { type: 'polyline', shape: { points: ghost.points, smooth: 0 }, style: strokeOf(ghost, 1.1, .3) },
            { type: 'polyline', shape: { points: main.points, smooth: 0 }, style: strokeOf(main, 2.2, .88) },
          )
        }
        return { type: 'group', children }
      },
    }],
  } as any
}

export interface HistogramBin { start: number; end: number; count: number }

export function utilizationHistogram(values: number[], warn: number, congest: number) {
  const bins: HistogramBin[] = Array.from({ length: 20 }, (_, i) => ({ start: i * 5, end: (i + 1) * 5, count: 0 }))
  for (const value of values) bins[Math.max(0, Math.min(19, Math.floor(value / 5)))].count++
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length ? (sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) : 0
  const max = Math.max(1, ...bins.map(bin => bin.count))
  const peak = bins.findIndex(bin => bin.count === max)
  return {
    bins, median,
    option: {
      animationDuration: 350,
      grid: { left: 4, right: 12, top: 32, bottom: 26, containLabel: true },
      tooltip: { ...tooltipBase, formatter: (p: any) => {
        const bin = bins[p.dataIndex]
        return bin ? `利用率 ${bin.start}%–${bin.end}%${bin.end === 100 ? '（含 100%）' : '（右端不含）'}<br/><b>${bin.count} 个小区</b>` : ''
      } },
      xAxis: { type: 'value', min: 0, max: 100, interval: 20, axisLine: { lineStyle: { color: C.border } }, axisTick: { show: true }, axisLabel: { ...axisLabel, formatter: '{value}%' }, splitLine: { show: false } },
      yAxis: { type: 'value', minInterval: 1, splitNumber: 3, max: Math.ceil(max * 1.22), splitLine, axisLabel },
      series: [{
        id: 'utilization-histogram', name: '小区数', type: 'custom', encode: { x: [0, 1], y: 2 },
        data: bins.map(bin => [bin.start, bin.end, bin.count]),
        renderItem: (params: any, api: any) => {
          const count = Number(api.value(2))
          const [left, base] = api.coord([Number(api.value(0)), 0])
          const right = api.coord([Number(api.value(1)), 0])[0]
          const top = api.coord([Number(api.value(0)), count])[1]
          const width = Math.max(1, right - left - 2)
          const children: any[] = [{ type: 'rect', shape: { x: left + 1, y: top, width, height: Math.max(0, base - top) }, style: { fill: 'rgba(51,78,172,.055)' } }]
          for (let k = 0; k < count; k++) {
            const y = api.coord([0, k + .5])[1]
            children.push({ type: 'line', shape: { x1: left + 2, x2: right - 2, y1: y, y2: y }, style: { stroke: params.dataIndex === peak ? C.primary : '#7096d1', lineWidth: 1.25 } })
          }
          if (params.dataIndex === peak) children.push({ type: 'text', x: (left + right) / 2, y: top - 10, style: { text: String(count), fill: C.primary, font: `700 12px ${CHART_FONT}`, align: 'center', verticalAlign: 'bottom' } })
          children.push({ type: 'rect', shape: { x: left, y: params.coordSys.y, width: Math.max(1, right - left), height: params.coordSys.height }, style: { fill: 'rgba(0,0,0,0)' } })
          return { type: 'group', children }
        },
      }, {
        id: 'histogram-thresholds', name: '参考阈值', type: 'line', data: [], silent: true,
        markLine: { symbol: 'none', silent: true, lineStyle: { width: 1, type: 'dashed' }, label: { fontSize: 10, position: 'end', rotate: 0 }, data: [
          { xAxis: median, lineStyle: { color: C.text2 }, label: { show: false } },
          { xAxis: warn, lineStyle: { color: C.amber }, label: { formatter: '预警', color: C.amber } },
          { xAxis: congest, lineStyle: { color: C.red }, label: { formatter: '拥塞', color: C.red } },
        ] },
      }],
    } as any,
  }
}
