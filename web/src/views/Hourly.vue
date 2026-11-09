<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import Panel from '@/components/Panel.vue'
import KpiCard from '@/components/KpiCard.vue'
import BaseChart from '@/components/BaseChart.vue'
import ShareWaffle from '@/components/ShareWaffle.vue'
import Disclosure from '@/components/Disclosure.vue'
import Icon from '@/components/Icon.vue'
import { useAsync } from '@/lib/useAsync'
import { api } from '@/api/client'
import { fmtBytes, hourLabel, splitBytes } from '@/lib/format'
import { axisLabel, C, gridBase, splitLine, tooltipBase } from '@/lib/chart'
import { dotHeatOption, type HeatAnim } from '@/lib/chartTemplates'
import { ChartSweep } from '@/lib/chartSweep'
import { downloadFile, toCsv, toast, ui } from '@/stores/ui'

const selectedDay = ref<number | null>(null)
const chartType = ref<'line' | 'bar'>('bar')
const trendChart = ref<InstanceType<typeof BaseChart> | null>(null)
const styleSwitching = ref(false)
let trendSweep: ChartSweep | null = null
let styleTimer = 0

function switchChartType(next: 'bar' | 'line') {
  if (next === chartType.value) return
  const chart = trendChart.value?.getChart()
  const host = trendChart.value?.$el as HTMLElement | undefined
  if (chart && host && !chart.isDisposed() && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    trendSweep ??= new ChartSweep(host)
    trendSweep.play(chart)
  }
  // 切换时新样式直接落定，由擦除动画承担过渡；错峰只保留给首次入场
  styleSwitching.value = true
  window.clearTimeout(styleTimer)
  styleTimer = window.setTimeout(() => { styleSwitching.value = false }, 720)
  chartType.value = next
}
const showAvg = ref(false)
const heatMode = ref<'abs' | 'share'>('abs')
const rankSort = ref<'flow' | 'hour'>('flow')
const heatPick = ref<{ day: number; hour: number } | null>(null)
const heat = useAsync(() => api.heatmap(ui.region), () => [ui.region, ui.tick])
const meta = useAsync(() => api.meta())
const hours = Array.from({ length: 24 }, (_, index) => hourLabel(index))
const dates = computed(() => Array.from({ length: 7 }, (_, index) => dayjs(meta.data.value?.dateEnd ?? '2026-11-08').subtract(6 - index, 'day')))
const dayLabels = computed(() => dates.value.map(date => date.format('MM-DD')))
const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const daily = computed(() => dates.value.map((date, index) => {
  const values = Array.from({ length: 24 }, () => 0)
  for (const [hour, day, value] of heat.data.value ?? []) if (day === index) values[hour] = value
  const total = values.reduce((sum, value) => sum + value, 0)
  const peak = Math.max(0, ...values)
  return { index, date, values, total, peak, peakIndex: values.indexOf(peak), average: total / 24 }
}))
const dayButtons = computed(() => [...daily.value].reverse())
const selected = computed(() => selectedDay.value === null ? null : daily.value[selectedDay.value])
const previous = computed(() => selectedDay.value !== null && selectedDay.value > 0 ? daily.value[selectedDay.value - 1] : null)
const previousDelta = computed(() => previous.value?.total && selected.value ? (selected.value.total / previous.value.total - 1) * 100 : undefined)
const dateSpan = computed(() => `${dates.value[0].format('MM月DD日')} — ${dates.value[6].format('MM月DD日')}`)
const selectedTitle = computed(() => selected.value ? `${selected.value.date.format('MM月DD日')} · ${weekdayLabels[selected.value.date.day()]}` : '')
const displayValues = computed(() => (heat.data.value ?? []).map(([hour, day, value]) => [hour, day, heatMode.value === 'abs' ? value : (daily.value[day].total ? value / daily.value[day].total * 100 : 0)]))
const ringTarget = computed(() => {
  const points = displayValues.value
  if (!points.length) return null
  const max = Math.max(1, ...points.map(point => point[2]))
  let peakHour: number
  let peakDay: number
  if (selectedDay.value !== null && daily.value[selectedDay.value]) {
    // 选中日期 → 标注当天峰值时段，与 KPI「峰值时段」一致
    peakHour = daily.value[selectedDay.value].peakIndex
    peakDay = selectedDay.value
  } else {
    // 未选中 → 标注当前展示值的全周最大格
    let best = 0
    for (let i = 1; i < points.length; i++) if (points[i][2] > points[best][2]) best = i
    peakHour = points[best][0]
    peakDay = points[best][1]
  }
  const peakValue = points.find(point => point[0] === peakHour && point[1] === peakDay)?.[2] ?? 0
  return {
    maskRow: selectedDay.value ?? 0,
    ringH: peakHour,
    ringD: peakDay,
    ringVF: Math.sqrt(peakValue / max),
    selected: selectedDay.value !== null ? 1 : 0,
  }
})
// 标注动画状态：ink 控制「消失/浮现」，draw 控制「划出/画圈」进度（两者共用 → 同步），
// 位置字段在重绘时直接落位。每帧写入触发热力图重绘，日期按钮笔触同源同步
const anim = reactive<HeatAnim>({ maskRow: 0, ringH: 0, ringD: 0, ringVF: 0, ink: 0, draw: 0, selected: 0 })
const pickerMaskStyle = computed(() => ({
  transform: `translateY(calc(${daily.value.length - 1 - anim.maskRow} * 100%))`,
}))
const pickerStrokeStyle = computed(() => ({
  opacity: String(anim.ink * anim.selected),
  strokeDashoffset: String(1 - anim.draw),
}))
// 选中日期的下划线改为规整直线，不再使用手绘抖动笔触
const pickerStrokeGhost = 'M0 7.6 L94 7.6'
const pickerStrokeMain = 'M0 5.4 L94 5.4'
// 实时读取系统偏好：运行中切换「减少动态效果」也能生效
function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
let animRaf = 0
let animToken = 0
let animKey = ''

function easeOutCubic(p: number) {
  return 1 - (1 - p) ** 3
}

type AnimTarget = { maskRow: number; ringH: number; ringD: number; ringVF: number; selected: number }

// 切换日期不做位移：旧下划线与峰值圈先淡出消失，随后在新日期落位，
// 下划线划出与峰值画圈共用 draw 进度同步绘制
function tweenAnim(target: AnimTarget) {
  cancelAnimationFrame(animRaf)
  const token = ++animToken
  const place = () => {
    anim.maskRow = target.maskRow
    anim.ringH = target.ringH
    anim.ringD = target.ringD
    anim.ringVF = target.ringVF
    anim.selected = target.selected
    anim.draw = 0
  }
  const drawIn = () => {
    if (token !== animToken) return
    place()
    const start = performance.now()
    const step = (now: number) => {
      if (token !== animToken) return
      const eased = easeOutCubic(Math.min(1, (now - start) / 420))
      anim.draw = eased
      anim.ink = Math.min(1, eased * 3.5)
      if (eased < 1) animRaf = requestAnimationFrame(step)
    }
    animRaf = requestAnimationFrame(step)
  }
  if (prefersReducedMotion()) {
    place()
    anim.draw = 1
    anim.ink = 1
    return
  }
  if (anim.ink > 0.02) {
    const from = anim.ink
    const start = performance.now()
    const step = (now: number) => {
      if (token !== animToken) return
      const p = Math.min(1, (now - start) / 160)
      anim.ink = from * (1 - easeOutCubic(p))
      if (p < 1) animRaf = requestAnimationFrame(step)
      else drawIn()
    }
    animRaf = requestAnimationFrame(step)
  } else {
    drawIn()
  }
}
watch(ringTarget, target => {
  if (!target) return
  // 仅数值刷新（如切换绝对值/占当天）时位置不变：直接同步半径系数，不重放绘制动画
  const key = `${target.maskRow}|${target.ringH}|${target.ringD}|${target.selected}`
  if (key === animKey) {
    anim.ringVF = target.ringVF
    return
  }
  animKey = key
  tweenAnim(target)
}, { immediate: true })
const heatOption = computed(() => {
  const option = dotHeatOption(displayValues.value, hours, dayLabels.value, value => heatMode.value === 'abs' ? fmtBytes(value) : `${value.toFixed(2)}%`, { ...anim }, heatAccent.value)
  option.grid = { left: 18, right: 18, top: 10, bottom: 30 }
  option.yAxis.axisLabel = { show: false }
  return option
})

// 选中某天时只标注全局最高/最低，且始终以“绝对值”口径计算。
// 这样切换“绝对值 / 占当天”时，红/绿标注的位置不会变化。
const heatAccent = computed(() => {
  const day = selected.value
  if (!day) return null
  const values = day.values
  const displayKey = (value: number) => fmtBytes(value)
  const peakKey = displayKey(Math.max(...values))
  const valleyKey = displayKey(Math.min(...values))
  if (peakKey === valleyKey) return { day: day.index, peakHours: [], valleyHours: [] }
  const peakHours: number[] = []
  const valleyHours: number[] = []
  values.forEach((value, hour) => {
    const key = displayKey(value)
    if (key === peakKey) peakHours.push(hour)
    if (key === valleyKey) valleyHours.push(hour)
  })
  return { day: day.index, peakHours, valleyHours }
})

function chooseDay(index: number) {
  selectedDay.value = index
  heatPick.value = null
}
function onHeatClick(params: any) {
  const [hour, day] = params.value
  selectedDay.value = day
  heatPick.value = { hour, day }
}
function closeDay() {
  selectedDay.value = null
  heatPick.value = null
}

const trendOption = computed(() => {
  const day = selected.value
  if (!day) return {}
  const compare = ui.compare && previous.value
  const focusedHour = heatPick.value?.day === day.index ? heatPick.value.hour : day.peakIndex
  return {
    // BaseChart 首帧会把 animation 落为 false（骨架屏交接），后续更新需显式恢复
    animation: true,
    animationDuration: styleSwitching.value ? 0 : 350,
    animationDurationUpdate: 560,
    animationDelayUpdate: 0,
    animationEasingUpdate: 'cubicInOut',
    animationType: chartType.value === 'line' ? 'expand' : 'expansion',
    animationDelay: chartType.value === 'bar' && !styleSwitching.value ? (idx: number) => idx * 12 : 0,
    grid: { ...gridBase, top: 24 },
    tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: chartType.value === 'bar' ? 'shadow' : 'line' }, formatter: (points: any[]) => {
      const current = points[0], before = points[1]
      return `${day.date.format('MM-DD')} ${current.axisValue}<br/>当天 <b>${fmtBytes(current.value)}</b>${before ? `<br/>前一天 ${fmtBytes(before.value)}` : ''}`
    } },
    xAxis: { type: 'category', data: hours, boundaryGap: true, axisLine: { lineStyle: { color: C.border } }, axisTick: { show: false }, axisLabel: { ...axisLabel, interval: 'auto' } },
    yAxis: { type: 'value', splitNumber: 4, splitLine, axisLabel: { ...axisLabel, formatter: (value: number) => fmtBytes(value, 0) } },
    series: [{
      id: 'day', name: '当天', type: chartType.value, smooth: false, data: day.values, barWidth: '70%',
      showSymbol: chartType.value === 'line', symbol: 'circle', symbolSize: 4,
      itemStyle: chartType.value === 'bar' ? { color: (p: any) => p.dataIndex === focusedHour ? '#081f5c' : '#7096d1', borderRadius: [3, 3, 0, 0] } : { color: C.primary },
      lineStyle: { width: 1.8, color: C.primary },
      label: { show: chartType.value === 'bar', position: 'top', color: C.primary, fontSize: 11, fontWeight: 650, formatter: (p: any) => p.dataIndex === focusedHour ? fmtBytes(p.value) : '' },
      markLine: showAvg.value ? { silent: true, symbol: 'none', lineStyle: { color: C.amber, type: 'dashed', width: 1 }, label: { show: false }, data: [{ yAxis: day.average }] } : undefined,
    }, ...(compare ? [{ id: 'previous', name: '前一天', type: 'line', data: previous.value!.values, smooth: false, showSymbol: false, lineStyle: { color: '#a6b3c7', type: 'dashed', width: 1.2 }, itemStyle: { color: '#a6b3c7' } }] : [])],
  } as any
})

const periods = computed(() => {
  const day = selected.value
  if (!day) return []
  const definitions = [
    { name: '早高峰 07–09时', from: 7, to: 9, color: '#a6bddb' },
    { name: '午间 11–13时', from: 11, to: 13, color: '#7096d1' },
    { name: '晚高峰 19–22时', from: 19, to: 22, color: '#334eac' },
    { name: '夜间 00–06时', from: 0, to: 6, color: '#778399' },
  ]
  const list = definitions.map(item => ({ name: item.name, color: item.color, value: day.values.slice(item.from, item.to + 1).reduce((sum, value) => sum + value, 0) }))
  return [...list, { name: '其他时段', color: '#d8e1ed', value: Math.max(0, day.total - list.reduce((sum, item) => sum + item.value, 0)) }]
})
const ranked = computed(() => {
  const day = selected.value
  if (!day) return []
  const list = day.values.map((value, hour) => ({ hour, value, share: day.total ? value / day.total * 100 : 0 }))
  return rankSort.value === 'flow' ? list.sort((a, b) => b.value - a.value) : list
})

function exportCsv() {
  if (!heat.data.value) { toast('warn', '时段数据还未就绪'); return }
  const days = selected.value ? [selected.value] : daily.value
  const rows: (string | number)[][] = [['日期', '小时', '流量(字节)', '占当日%'], ...days.flatMap(day => day.values.map((value, hour) => [day.date.format('YYYY-MM-DD'), hourLabel(hour), value, day.total ? (value / day.total * 100).toFixed(2) : '0']))]
  downloadFile(`时段分析_${selected.value?.date.format('YYYY-MM-DD') ?? '近7天'}_${ui.region}.csv`, toCsv(rows))
  toast('success', '已导出时段数据', `${rows.length - 1} 行小时读数`)
}
onMounted(() => window.addEventListener('telco:export', exportCsv))
onUnmounted(() => {
  window.removeEventListener('telco:export', exportCsv)
  cancelAnimationFrame(animRaf)
  window.clearTimeout(styleTimer)
  trendSweep?.dispose()
  trendSweep = null
})
</script>

<template>
  <div class="page hourly-page">
    <div v-if="heat.error.value" class="card error-card"><Icon name="alert" :size="22" /><div><strong>时段数据加载失败</strong><p>{{ heat.error.value }}</p></div><button class="btn" @click="heat.run">重试</button></div>
    <template v-else>
      <Panel class="weekly-panel" data-template="F10" title="周 × 小时流量热力图" :sub="`${dateSpan} · ${ui.region === 'all' ? '全国' : ui.region}`">
        <template #actions><div v-seg-mask class="seg" aria-label="热力图统计方式"><button class="seg__item" :class="{ 'is-active': heatMode === 'abs' }" @click="heatMode = 'abs'">绝对值</button><button class="seg__item" :class="{ 'is-active': heatMode === 'share' }" @click="heatMode = 'share'">占当天</button></div></template>
        <div class="heatmap-explorer">
          <nav class="day-picker" aria-label="选择日期查看当天详情">
            <div class="day-picker-mask" aria-hidden="true" :style="pickerMaskStyle">
              <svg class="day-picker-stroke" viewBox="0 0 94 12" preserveAspectRatio="none" :style="pickerStrokeStyle">
                <path :d="pickerStrokeGhost" pathLength="1" class="day-picker-stroke__ghost" />
                <path :d="pickerStrokeMain" pathLength="1" class="day-picker-stroke__ink" />
              </svg>
            </div>
            <button v-for="day in dayButtons" :key="day.index" class="day-button" :class="{ 'is-selected': selectedDay === day.index }" :aria-pressed="selectedDay === day.index" :aria-label="`查看 ${day.date.format('YYYY-MM-DD')} 的统计详情`" @click="chooseDay(day.index)"><strong>{{ day.date.format('MM-DD') }}</strong><span>{{ weekdayLabels[day.date.day()] }}</span><Icon name="chevron-right" :size="12" /></button>
          </nav>
          <BaseChart :option="heatOption" :loading="heat.loading.value && !heat.data.value" height="360px" :replace-merge="['series', 'visualMap']" @chart-click="onHeatClick" />
        </div>
        <div class="heat-footer"><span class="heat-help"><Icon name="calendar" :size="13" />选择左侧日期，展开当天统计与图表</span><span class="heat-meta"><span v-if="selected" class="heat-accent"><i class="is-peak" />峰值<i class="is-valley" />谷值</span>{{ heatMode === 'abs' ? '点面积表示流量' : '每行合计 100%' }}</span></div>
      </Panel>

      <section v-if="selected" class="day-details" aria-label="选中日期的详细分析" :data-date="selected.date.format('YYYY-MM-DD')">
        <header class="day-detail-heading"><div><span class="detail-kicker">当天详情</span><h2>{{ selectedTitle }}</h2></div><button class="btn btn--ghost btn--sm" @click="closeDay"><Icon name="close" :size="14" />收起详情</button></header>
        <div v-if="heatPick" class="heat-pick" aria-live="polite">已选 {{ selected.date.format('MM-DD') }} {{ hourLabel(heatPick.hour) }}<strong>{{ fmtBytes(selected.values[heatPick.hour]) }}</strong></div>
        <div class="kpi-grid">
          <KpiCard label="当天总流量" :value="splitBytes(selected.total).value" :unit="splitBytes(selected.total).unit" :delta="previousDelta" :delta-label="previous ? '较前一天' : '24 小时流量合计'" icon="wifi" />
          <KpiCard label="峰值时段" :value="hourLabel(selected.peakIndex)" delta-label="当日流量最高的小时" icon="clock" />
          <KpiCard label="峰值小时流量" :value="splitBytes(selected.peak).value" :unit="splitBytes(selected.peak).unit" delta-label="一个小时内的聚合流量" icon="activity" />
        </div>
        <div class="metric-strip"><span>日均小时流量<strong>{{ fmtBytes(selected.average) }}</strong></span><span>峰均比<strong>{{ (selected.peak / Math.max(1, selected.average)).toFixed(2) }}×</strong></span></div>
        <div class="day-charts">
          <Panel data-chart="day-trend" :data-template="chartType === 'bar' ? 'G12' : 'F2'" title="当天 24 小时流量" :sub="`${selected.date.format('MM月DD日')} · 每小时独立读数`">
            <template #actions><div v-seg-mask class="seg seg--sm"><button class="seg__item" :class="{ 'is-active': chartType === 'bar' }" @click="switchChartType('bar')">柱状</button><button class="seg__item" :class="{ 'is-active': chartType === 'line' }" @click="switchChartType('line')">折线</button></div></template>
            <div class="chart-controls"><button v-if="previous" class="control-toggle" :class="{ 'is-active': ui.compare }" :aria-pressed="ui.compare" @click="ui.compare = !ui.compare"><span />对比前一天</button><button class="control-toggle" :class="{ 'is-active': showAvg }" :aria-pressed="showAvg" @click="showAvg = !showAvg"><span />日均线</button></div>
            <BaseChart ref="trendChart" :option="trendOption" height="280px" :replace-merge="['series']" />
            <p v-if="showAvg" class="chart-note">橙色虚线：当天小时均值 {{ fmtBytes(selected.average) }}</p>
          </Panel>
          <Panel data-template="G4" title="当天时段构成" sub="全部时段合计 100%"><ShareWaffle :items="periods" /></Panel>
        </div>
        <Disclosure title="查看当天 24 小时明细" sub="按流量排名或时间顺序逐项核对">
          <div class="detail-table-head"><span>{{ selected.date.format('YYYY-MM-DD') }} · 24 条读数</span><div v-seg-mask class="seg seg--sm"><button class="seg__item" :class="{ 'is-active': rankSort === 'flow' }" @click="rankSort = 'flow'">按流量</button><button class="seg__item" :class="{ 'is-active': rankSort === 'hour' }" @click="rankSort = 'hour'">按时间</button></div></div>
          <div class="table-wrap" v-swap-reveal><table class="table"><thead><tr><th>小时</th><th class="num">流量</th><th class="num">占当天</th></tr></thead><tbody><tr v-for="(row, i) in ranked" :key="row.hour" :style="{ '--row-i': i }"><td>{{ hourLabel(row.hour) }}</td><td class="num">{{ fmtBytes(row.value) }}</td><td class="num">{{ row.share.toFixed(1) }}%</td></tr></tbody></table></div>
        </Disclosure>
      </section>
      <div v-else class="day-placeholder"><Icon name="calendar" :size="20" /><div><strong>先看整周规律，再看一天的细节</strong><p>点击热力图左侧的日期，即可展开当天统计卡片和详细图表。</p></div></div>
    </template>
  </div>
</template>

<style scoped>
.page, .day-details { display: flex; flex-direction: column; gap: 24px; }
.heatmap-explorer { display: grid; grid-template-columns: 106px minmax(0, 1fr); gap: 14px; }
.day-picker { position: relative; display: grid; grid-template-rows: repeat(7, minmax(0, 1fr)); padding: 10px 0 30px; height: 360px; }
.day-picker-mask {
  position: absolute;
  left: 0;
  right: 0;
  top: 10px;
  height: calc((100% - 40px) / 7);
  will-change: transform;
  pointer-events: none;
  z-index: 0;
}
.day-picker-stroke {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: -1px;
  height: 12px;
  overflow: visible;
  stroke-dasharray: 1;
}
.day-picker-stroke path {
  fill: none;
  stroke: var(--text);
  stroke-linecap: square;
  stroke-linejoin: miter;
  vector-effect: non-scaling-stroke;
}
.day-picker-stroke__ink { stroke-width: 2.2; opacity: .88; }
.day-picker-stroke__ghost { stroke-width: 1.1; opacity: .3; }
.day-button { position: relative; z-index: 1; display: grid; grid-template-columns: 1fr 16px; align-content: center; padding: 5px 12px; text-align: left; border: 1px solid transparent; border-radius: 8px; }
.day-button strong { font-size: 13px; font-weight: 550; color: var(--text-2); transition: color .25s ease; }
.day-button > span { font-size: 10px; color: var(--text-3); margin-top: 1px; }
.day-button > svg { grid-column: 2; grid-row: 1 / 3; align-self: center; color: var(--text-3); opacity: 0; transition: opacity .25s ease, color .25s ease; }
.day-button:hover { background: var(--surface-2); }
.day-button.is-selected { animation: day-select-pop .32s cubic-bezier(.34, 1.4, .64, 1); }
.day-button.is-selected:hover { background: transparent; }
.day-button.is-selected strong { color: var(--text); }
.day-button.is-selected > svg { opacity: 1; color: var(--text); }
@keyframes day-select-pop {
  0% { transform: scale(.965); }
  55% { transform: scale(1.012); }
  100% { transform: scale(1); }
}
.heat-footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px 24px; margin-top: 8px; padding-top: 16px; border-top: 1px solid var(--border); color: var(--text-3); font-size: 12px; }
.heat-help { display: inline-flex; align-items: center; gap: 7px; color: var(--text-2); }
.heat-meta { display: inline-flex; align-items: center; gap: 8px; }
.heat-accent { display: inline-flex; align-items: center; gap: 5px; margin-right: 4px; }
.heat-accent i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.heat-accent .is-peak { background: #dc2f2f; }
.heat-accent .is-valley { background: #0e9f6e; margin-left: 5px; }
.day-detail-heading { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-top: 8px; }
.detail-kicker { font-size: 12px; color: var(--text-3); }
.day-detail-heading h2 { font-size: 22px; font-weight: 600; letter-spacing: -.02em; margin-top: 5px; }
.kpi-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
.day-charts { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(0, 1fr); gap: 24px; }
.day-charts :deep(.panel-head) { flex-wrap: wrap; }
.day-charts :deep(.panel-body) { padding-top: 14px; }
.chart-controls { display: flex; flex-wrap: wrap; gap: 18px; margin-bottom: 10px; }
.control-toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-3); }
.control-toggle > span { width: 11px; height: 11px; border: 1px solid var(--border-strong); border-radius: 3px; background: var(--surface); }
.control-toggle.is-active { color: var(--text-2); }
.control-toggle.is-active > span { background: var(--primary); border-color: var(--primary); box-shadow: inset 0 0 0 2px var(--surface); }
.heat-pick { padding: 10px 14px; border-left: 2px solid var(--primary); color: var(--text-2); font-size: 12px; background: var(--primary-soft); }
.heat-pick strong { color: var(--primary); margin-left: 16px; }
.day-placeholder { display: flex; gap: 16px; align-items: center; padding: 24px 6px; color: var(--text-3); }
.day-placeholder strong { color: var(--text-2); font-size: 14px; font-weight: 550; }
.day-placeholder p { font-size: 12px; line-height: 1.7; margin-top: 5px; }
.detail-table-head { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin: 10px 0 16px; color: var(--text-3); font-size: 12px; }
/* 明细表格展开：行级联淡入（收起再展开会重播）；排序只移动行节点不重挂载，不受影响 */
@media (prefers-reduced-motion: no-preference) {
  .day-details :deep(.disclosure[open]) .table-wrap tr {
    animation: detail-row-in 220ms ease-out both;
    animation-delay: calc(var(--row-i) * 10ms);
  }
}
@keyframes detail-row-in { from { opacity: 0; } }
.weekly-skeleton { height: 490px; }
.error-card { display: flex; align-items: center; gap: 16px; padding: 24px; color: var(--red); }
.error-card p { color: var(--text-3); font-size: 12px; }
.error-card button { margin-left: auto; }
@media (max-width: 1120px) { .day-charts { grid-template-columns: 1fr; } }
@media (max-width: 680px) {
  .heatmap-explorer { grid-template-columns: 64px minmax(0, 1fr); gap: 6px; }
  .day-button { padding: 4px 6px; grid-template-columns: 1fr; }
  .day-button strong { font-size: 12px; }
  .day-button > svg { display: none; }
  .heat-footer { font-size: 11px; }
  .kpi-grid { grid-template-columns: 1fr; gap: 14px; }
  .day-detail-heading h2 { font-size: 20px; }
  .day-placeholder { align-items: flex-start; padding-top: 12px; }
  .day-placeholder > svg { flex-shrink: 0; margin-top: 3px; }
  .detail-table-head { flex-direction: column; align-items: flex-start; gap: 12px; }
}
</style>
