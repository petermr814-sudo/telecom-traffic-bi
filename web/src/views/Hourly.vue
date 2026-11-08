<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import dayjs from 'dayjs'
import Panel from '@/components/Panel.vue'
import KpiCard from '@/components/KpiCard.vue'
import BaseChart from '@/components/BaseChart.vue'
import Icon from '@/components/Icon.vue'
import { useAsync } from '@/lib/useAsync'
import { api } from '@/api/client'
import { fmtBytes, fmtDelta, hourLabel, splitBytes, RANGE_LABEL } from '@/lib/format'
import { axisLabel, C, gridBase, splitLine, tooltipBase } from '@/lib/chart'
import { downloadFile, toCsv, toast, ui } from '@/stores/ui'

const chartType = ref<'area' | 'bar'>('area')
const showAvg = ref(true)
const heatMode = ref<'abs' | 'share'>('abs')
const rankSort = ref<'flow' | 'hour'>('flow')
const heatPick = ref<{ day: number; hour: number; value: number } | null>(null)
const heatLoading = ref(false)

const { data, loading, error, run } = useAsync(
  () => api.hourly(ui.range, ui.region),
  () => [ui.range, ui.region, ui.tick]
)

const heat = useAsync(
  () => api.heatmap(ui.region),
  () => [ui.region, ui.tick]
)

const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)
const dayLabels = Array.from({ length: 7 }, (_, i) => dayjs('2026-11-08').subtract(6 - i, 'day').format('MM-DD'))

const ratio = computed(() => {
  if (!data.value) return 0
  return data.value.peakBytes / Math.max(1, data.value.avgBytes)
})

const totalDelta = computed(() => {
  const d = data.value
  if (!d) return 0
  const cur = d.current.reduce((a, b) => a + b, 0)
  const prev = d.compare.reduce((a, b) => a + b, 0)
  return prev ? (cur / prev - 1) * 100 : 0
})

const peakDelta = computed(() => {
  const d = data.value
  if (!d) return 0
  const prev = Math.max(...d.compare)
  return (d.peakBytes / Math.max(1, prev) - 1) * 100
})

const trendOption = computed(() => {
  const d = data.value
  if (!d) return {}
  const avgLine = d.avgBytes
  return {
    animationDuration: 500,
    grid: { ...gridBase, top: 28 },
    tooltip: {
      trigger: 'axis',
      ...tooltipBase,
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(31,94,255,0.05)' } },
      formatter: (ps: any[]) => {
        const p = ps[0]
        const c = ps[1]
        const diff = c && c.value ? ((p.value / c.value - 1) * 100).toFixed(1) : ''
        return `<div style="font-weight:600;margin-bottom:4px">${p.axisValue}</div>
          <div style="display:flex;justify-content:space-between;gap:18px"><span>本期</span><b>${fmtBytes(p.value)}</b></div>
          ${c ? `<div style="display:flex;justify-content:space-between;gap:18px;opacity:.7"><span>上期</span><span>${fmtBytes(c.value)}</span></div>` : ''}
          ${diff ? `<div style="margin-top:3px;color:${Number(diff) >= 0 ? '#6ee7b7' : '#fca5a5'}">环比 ${Number(diff) > 0 ? '+' : ''}${diff}%</div>` : ''}`
      }
    },
    xAxis: {
      type: 'category',
      data: hours,
      axisLine: { lineStyle: { color: C.border } },
      axisTick: { show: false },
      axisLabel: { ...axisLabel, interval: 1 }
    },
    yAxis: {
      type: 'value',
      splitLine,
      axisLabel: { ...axisLabel, formatter: (v: number) => fmtBytes(v, 0) }
    },
    series: [
      {
        name: '本期',
        type: chartType.value === 'bar' ? 'bar' : 'line',
        smooth: chartType.value === 'bar' ? false : 0.35,
        showSymbol: false,
        barWidth: '54%',
        data: d.current,
        itemStyle: chartType.value === 'bar'
          ? {
              borderRadius: [4, 4, 0, 0],
              color: {
                type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: '#4b7dff' },
                  { offset: 1, color: 'rgba(75,125,255,0.35)' }
                ]
              }
            }
          : { color: C.primary },
        lineStyle: { width: 2.4, color: C.primary },
        areaStyle: chartType.value === 'area'
          ? {
              color: {
                type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: 'rgba(31,94,255,0.18)' },
                  { offset: 1, color: 'rgba(31,94,255,0)' }
                ]
              }
            }
          : undefined,
        markLine: showAvg.value
          ? {
              silent: true,
              symbol: 'none',
              lineStyle: { color: '#d97a00', type: 'dashed', width: 1.2 },
              label: { formatter: `日均 ${fmtBytes(avgLine, 0)}`, position: 'insideEndTop', color: '#d97a00', fontSize: 10 },
              data: [{ yAxis: avgLine }]
            }
          : undefined
      },
      ...(ui.compare
        ? [{
            name: '上期',
            type: 'line',
            smooth: 0.35,
            showSymbol: false,
            data: d.compare,
            lineStyle: { width: 1.4, type: 'dashed', color: '#a9b8d3' },
            itemStyle: { color: '#a9b8d3' }
          }]
        : [])
    ]
  } as any
})

const heatOption = computed(() => {
  const points = heat.data.value
  if (!points) return {}
  const values = points.map(([h, d, v]) => {
    if (heatMode.value === 'abs') return [h, d, v]
    const dayTotal = points.filter((p) => p[1] === d).reduce((s, p) => s + p[2], 0)
    return [h, d, Number(((v / dayTotal) * 100).toFixed(2))]
  })
  const max = Math.max(...values.map((v) => v[2] as number))
  return {
    animationDuration: 400,
    grid: { left: 46, right: 64, top: 10, bottom: 26 },
    tooltip: {
      ...tooltipBase,
      formatter: (p: any) => {
        const [h, d, v] = p.value
        return `${dayLabels[d]} ${hourLabel(h)}<br/><b>${heatMode.value === 'abs' ? fmtBytes(v) : `${v}%`}</b>`
      }
    },
    xAxis: {
      type: 'category',
      data: hours,
      splitArea: { show: false },
      axisLine: { lineStyle: { color: C.border } },
      axisTick: { show: false },
      axisLabel: { ...axisLabel, interval: 2 }
    },
    yAxis: {
      type: 'category',
      data: dayLabels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...axisLabel }
    },
    visualMap: {
      type: 'continuous',
      seriesIndex: 0,
      dimension: 2,
      min: 0,
      max,
      calculable: false,
      orient: 'vertical',
      right: 6,
      top: 26,
      itemWidth: 10,
      itemHeight: 96,
      textStyle: { fontSize: 9.5, color: C.axis },
      inRange: { color: ['#eef3ff', '#cad9ff', '#8fb0ff', '#4b7dff', '#1f5eff'] }
    },
    series: [
      {
        type: 'heatmap',
        data: values,
        itemStyle: { borderColor: '#fff', borderWidth: 1.5, borderRadius: 2 },
        emphasis: { itemStyle: { borderColor: C.text, borderWidth: 1 } }
      }
    ]
  } as any
})

const periods = computed(() => {
  const d = data.value
  if (!d) return []
  const total = d.current.reduce((a, b) => a + b, 0)
  const defs = [
    { name: '早高峰', range: [7, 9], color: 'var(--cyan)' },
    { name: '午间', range: [11, 13], color: 'var(--violet)' },
    { name: '晚高峰', range: [19, 22], color: 'var(--primary)' },
    { name: '夜间', range: [0, 6], color: 'var(--text-3)' }
  ]
  return defs.map((x) => {
    const sum = d.current.slice(x.range[0], x.range[1] + 1).reduce((a, b) => a + b, 0)
    return { ...x, share: (sum / total) * 100, bytes: sum }
  })
})

const ranked = computed(() => {
  const d = data.value
  if (!d) return []
  const list = d.current.map((v, h) => {
    const prev = d.compare[h] || 0
    const total = d.current.reduce((a, b) => a + b, 0)
    return {
      hour: h,
      value: v,
      share: (v / total) * 100,
      delta: prev ? (v / prev - 1) * 100 : 0
    }
  })
  return rankSort.value === 'flow' ? [...list].sort((a, b) => b.value - a.value) : list
})

function onHeatClick(p: any) {
  const [h, d, v] = p.value
  heatPick.value = { day: d, hour: h, value: v }
}

const rangeLabel = computed(() => RANGE_LABEL[ui.range])

function exportCsv() {
  const d = data.value
  if (!d) return
  const rows: (string | number)[][] = [
    ['时段', '本期流量(字节)', '上期流量(字节)', '环比%'],
    ...d.current.map((v, i) => [hours[i], v, d.compare[i] ?? 0, d.compare[i] ? ((v / d.compare[i] - 1) * 100).toFixed(1) : ''])
  ]
  downloadFile(`时段分析_${rangeLabel.value}_${ui.region}.csv`, toCsv(rows))
  toast('success', '已导出 CSV', `${rows.length - 1} 行时段数据`)
}

onMounted(() => window.addEventListener('telco:export', exportCsv))
onUnmounted(() => window.removeEventListener('telco:export', exportCsv))
</script>

<template>
  <div v-if="error" class="card error-card">
    <Icon name="alert" :size="22" />
    <div><strong>时段数据加载失败</strong><p>{{ error }}</p></div>
    <button class="btn btn--primary" @click="run">重试</button>
  </div>

  <div v-else-if="data" class="page">
    <section class="kpi-grid">
      <KpiCard
        label="峰值时段"
        :value="hourLabel(data.peakIndex)"
        icon="clock"
        tone="blue"
        :delta="peakDelta"
        delta-label="峰值流量较上期"
        :spark="data.current"
      />
      <KpiCard
        label="峰值流量"
        :value="splitBytes(data.peakBytes).value"
        :unit="splitBytes(data.peakBytes).unit"
        icon="activity"
        tone="violet"
        :delta="peakDelta"
        :spark="data.current"
      />
      <KpiCard
        label="日均小时流量"
        :value="splitBytes(data.avgBytes).value"
        :unit="splitBytes(data.avgBytes).unit"
        icon="wifi"
        tone="teal"
        :delta="totalDelta"
        delta-label="整体较上期"
        :spark="data.current"
      />
      <KpiCard
        label="峰均比"
        :value="ratio.toFixed(2)"
        unit="×"
        icon="trend-up"
        tone="amber"
        :delta="0"
        delta-label="峰值 / 日均"
        :spark="data.current"
      />
    </section>

    <div class="grid grid--main">
      <Panel title="24 小时流量分布" :sub="`${ui.region === 'all' ? '全国' : ui.region} · ${rangeLabel}`">
        <template #actions>
          <div class="seg seg--sm">
            <button class="seg__item" :class="{ 'is-active': chartType === 'area' }" @click="chartType = 'area'">面积</button>
            <button class="seg__item" :class="{ 'is-active': chartType === 'bar' }" @click="chartType = 'bar'">柱状</button>
          </div>
          <button class="btn btn--sm" :class="{ 'is-active': showAvg }" @click="showAvg = !showAvg">
            日均线
          </button>
        </template>
        <BaseChart :option="trendOption" height="300px" :replace-merge="['series']" />
      </Panel>

      <Panel title="全天流量结构" sub="按典型时段聚合">
        <ul class="periods">
          <li v-for="p in periods" :key="p.name">
            <div class="period-top">
              <span class="period-name">{{ p.name }}</span>
              <span class="period-share num">{{ p.share.toFixed(1) }}%</span>
            </div>
            <div class="period-track"><i :style="{ width: `${p.share}%`, background: p.color }" /></div>
            <div class="period-foot">
              <span>{{ p.range[0] === 0 ? '00' : p.range[0] }}:00 – {{ p.range[1] }}:59</span>
              <span class="num">{{ fmtBytes(p.bytes, 0) }}</span>
            </div>
          </li>
        </ul>
        <div class="period-note">
          <Icon name="info" :size="13" />
          晚高峰贡献了全天 {{ periods[2]?.share.toFixed(1) }}% 的流量，是扩容与保障的重点窗口。
        </div>
      </Panel>
    </div>

    <div class="grid grid--heat">
      <Panel title="周 × 小时流量热力图" sub="最近 7 天，颜色越深流量越高">
        <template #actions>
          <div class="seg seg--sm">
            <button class="seg__item" :class="{ 'is-active': heatMode === 'abs' }" @click="heatMode = 'abs'">绝对值</button>
            <button class="seg__item" :class="{ 'is-active': heatMode === 'share' }" @click="heatMode = 'share'">占全天</button>
          </div>
        </template>
        <BaseChart :option="heatOption" height="252px" :replace-merge="['series', 'visualMap']" @chart-click="onHeatClick" />
        <div class="heat-foot">
          <span v-if="heatPick" class="heat-pick">
            <Icon name="target" :size="12" />
            已选 {{ dayLabels[heatPick.day] }} {{ hourLabel(heatPick.hour) }}
            <b>{{ heatMode === 'abs' ? fmtBytes(heatPick.value) : `${heatPick.value.toFixed(2)}%` }}</b>
          </span>
          <span v-else class="muted">{{ heatMode === 'abs' ? '点击任意色块查看该时段流量' : '占全天：每行 24 小时合计 100%' }}</span>
          <span class="muted">周中晚高峰更集中，周末峰值后移约 1 小时</span>
        </div>
      </Panel>

      <Panel title="时段明细" sub="按流量排序，可切换时间顺序">
        <template #actions>
          <div class="seg seg--sm">
            <button class="seg__item" :class="{ 'is-active': rankSort === 'flow' }" @click="rankSort = 'flow'">按流量</button>
            <button class="seg__item" :class="{ 'is-active': rankSort === 'hour' }" @click="rankSort = 'hour'">按时间</button>
          </div>
        </template>
        <div class="table-wrap rank-wrap">
          <table class="table table--compact">
            <thead>
              <tr>
                <th>时段</th>
                <th class="num">流量</th>
                <th class="num">占全天</th>
                <th class="num">环比</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in ranked" :key="r.hour">
                <td class="is-strong num">{{ hourLabel(r.hour) }}</td>
                <td class="num">{{ fmtBytes(r.value, 0) }}</td>
                <td class="num">{{ r.share.toFixed(1) }}%</td>
                <td class="num">
                  <span class="delta" :class="r.delta >= 0 ? 'delta--up' : 'delta--down'">{{ fmtDelta(r.delta) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  </div>

  <div v-else class="skeleton-page">
    <div class="kpi-grid"><div v-for="i in 4" :key="i" class="skeleton kpi-skel" /></div>
    <div class="grid grid--main"><div class="skeleton panel-skel" /><div class="skeleton panel-skel" /></div>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.grid {
  display: grid;
  gap: 12px;
}

.grid--main {
  grid-template-columns: minmax(0, 1.85fr) minmax(0, 1fr);
}

.grid--heat {
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
}

.seg--sm .seg__item {
  height: 24px;
  padding: 0 8px;
  font-size: 11px;
}

.btn.is-active {
  background: var(--primary-soft);
  border-color: var(--primary-border);
  color: var(--primary);
}

.periods {
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.period-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.period-name {
  font-size: 12px;
  color: var(--text-2);
}

.period-share {
  font-size: 15px;
  font-weight: 600;
}

.period-track {
  height: 5px;
  border-radius: 999px;
  background: var(--surface-3);
  margin: 5px 0 4px;
  overflow: hidden;
}

.period-track i {
  display: block;
  height: 100%;
  border-radius: 999px;
}

.period-foot {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--text-3);
}

.period-note {
  display: flex;
  gap: 7px;
  margin-top: 14px;
  padding: 9px 10px;
  border-radius: 7px;
  background: var(--surface-2);
  font-size: 10.5px;
  color: var(--text-3);
  line-height: 1.55;
}

.period-note svg {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--primary);
}

.heat-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 6px;
  font-size: 10.5px;
}

.heat-pick {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-2);
}

.heat-pick b {
  color: var(--text);
  font-weight: 600;
}

.rank-wrap {
  max-height: 268px;
  overflow-y: auto;
}

.error-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 24px;
  color: var(--red);
}

.error-card strong { color: var(--text); font-size: 13px; }
.error-card p { color: var(--text-3); font-size: 12px; margin-top: 2px; }
.error-card .btn { margin-left: auto; }

.skeleton-page { display: flex; flex-direction: column; gap: 12px; }
.kpi-skel { height: 118px; }
.panel-skel { height: 340px; }

@media (max-width: 1280px) {
  .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .grid--main, .grid--heat { grid-template-columns: minmax(0, 1fr); }
}
</style>
