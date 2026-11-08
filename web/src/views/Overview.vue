<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import Panel from '@/components/Panel.vue'
import KpiCard from '@/components/KpiCard.vue'
import BaseChart from '@/components/BaseChart.vue'
import Icon from '@/components/Icon.vue'
import { useAsync } from '@/lib/useAsync'
import { api } from '@/api/client'
import type { CellRow } from '@/api/types'
import { fmtBytes, fmtCount, fmtRate, hourLabel, splitBytes, splitRate, RANGE_LABEL } from '@/lib/format'
import { axisLabel, C, chartPalette, gridBase, splitLine, tooltipBase } from '@/lib/chart'
import { downloadFile, toCsv, toast, ui } from '@/stores/ui'

const router = useRouter()

const { data, error, run } = useAsync(
  () => api.overview(ui.range, ui.region, ui.settings.warn, ui.settings.congest),
  () => [ui.range, ui.region, ui.tick, ui.settings.warn, ui.settings.congest]
)

const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)

const total = computed(() => splitBytes(data.value?.kpi.totalBytes ?? 0))
const peak = computed(() => splitRate(data.value?.kpi.peakBps ?? 0))
const users = computed(() => fmtCount(data.value?.kpi.activeUsers ?? 0).replace(' 亿', ''))
const usersUnit = computed(() => (fmtCount(data.value?.kpi.activeUsers ?? 0).includes('亿') ? '亿' : '万'))

const peakHour = computed(() => data.value?.kpi.peakHour ?? 0)
const peakLabel = computed(() => hourLabel(peakHour.value))

const trendOption = computed(() => {
  const d = data.value
  if (!d) return {}
  const peakValue = d.hourly[d.peakIndex] ?? 0
  return {
    animationDuration: 600,
    color: [C.primary, '#a9b8d3'],
    grid: { ...gridBase, top: 34 },
    tooltip: {
      trigger: 'axis',
      ...tooltipBase,
      axisPointer: { type: 'line', lineStyle: { color: '#c6d2e6', type: 'dashed' } },
      formatter: (ps: any[]) => {
        const p = ps[0]
        const cmp = ps[1]
        const diff = cmp && cmp.value ? ((p.value / cmp.value - 1) * 100).toFixed(1) : ''
        return `<div style="font-weight:600;margin-bottom:4px">${p.axisValue}</div>
          <div style="display:flex;gap:14px;justify-content:space-between"><span>本期</span><b>${fmtBytes(p.value)}</b></div>
          ${cmp ? `<div style="display:flex;gap:14px;justify-content:space-between;opacity:.75"><span>上期</span><span>${fmtBytes(cmp.value)}</span></div>` : ''}
          ${diff ? `<div style="margin-top:3px;color:${Number(diff) >= 0 ? '#6ee7b7' : '#fca5a5'}">环比 ${Number(diff) > 0 ? '+' : ''}${diff}%</div>` : ''}`
      }
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: hours,
      axisLine: { lineStyle: { color: C.border } },
      axisTick: { show: false },
      axisLabel: { ...axisLabel, interval: 2 }
    },
    yAxis: {
      type: 'value',
      splitLine,
      axisLabel: { ...axisLabel, formatter: (v: number) => fmtBytes(v, 0) }
    },
    series: [
      {
        name: '本期',
        type: 'line',
        smooth: 0.35,
        showSymbol: false,
        data: d.hourly,
        lineStyle: { width: 2.4, color: C.primary },
        itemStyle: { color: C.primary },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(31,94,255,0.20)' },
              { offset: 1, color: 'rgba(31,94,255,0)' }
            ]
          }
        },
        markPoint: {
          symbol: 'circle',
          symbolSize: 9,
          itemStyle: { color: '#fff', borderColor: C.primary, borderWidth: 2.5 },
          label: {
            show: true,
            position: 'top',
            distance: 8,
            formatter: `峰值 ${fmtBytes(peakValue)}`,
            color: C.text,
            fontSize: 10.5,
            fontWeight: 600,
            backgroundColor: '#fff',
            borderColor: C.border,
            borderWidth: 1,
            borderRadius: 5,
            padding: [4, 7]
          },
          data: [{ coord: [d.peakIndex, peakValue] }]
        },
        markArea: {
          silent: true,
          itemStyle: { color: 'rgba(31,94,255,0.05)' },
          label: { show: false },
          data: [[{ xAxis: hours[Math.max(0, d.peakIndex - 1)] }, { xAxis: hours[Math.min(23, d.peakIndex + 1)] }]]
        }
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

const donutOption = computed(() => {
  const d = data.value
  if (!d) return {}
  return {
    animationDuration: 600,
    color: chartPalette,
    tooltip: {
      ...tooltipBase,
      formatter: (p: any) => `${p.name}<br/><b>${fmtBytes(p.value)}</b> · ${p.percent}%`
    },
    series: [
      {
        type: 'pie',
        radius: ['62%', '84%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 3 },
        label: { show: false },
        emphasis: { scale: true, scaleSize: 4 },
        data: d.regionShare.map((r) => ({ name: r.region, value: r.bytes }))
      }
    ],
    graphic: [
      { type: 'text', left: 'center', top: '42%', style: { text: '总流量', fill: '#8b97ad', fontSize: 10.5, textAlign: 'center' } },
      { type: 'text', left: 'center', top: '50%', style: { text: fmtBytes(d.kpi.totalBytes, 1), fill: '#0c1526', fontSize: 17, fontWeight: 600, textAlign: 'center' } }
    ]
  } as any
})

const insights = computed(() => {
  const d = data.value
  if (!d) return []
  const avg = d.kpi.totalBytes / 24
  const ratio = (d.kpi.peakBps / Math.max(1, (avg * 8) / 3600)).toFixed(1)
  const top = d.regionShare[0]
  const congested = Math.round((d.kpi.busyCellRatio / 100) * 420)
  return [
    { icon: 'clock', title: `峰值出现在 ${peakLabel.value}`, desc: `峰值速率 ${fmtRate(d.kpi.peakBps)}，峰均比 ${ratio}×` },
    { icon: 'map', title: `${top.region} 流量最高`, desc: `占全网 ${top.share.toFixed(1)}%，约 ${fmtBytes(top.bytes, 0)}` },
    { icon: 'tower', title: `${congested} 个小区进入忙时高负载`, desc: `占重点小区 ${d.kpi.busyCellRatio.toFixed(1)}%，建议关注扩容` }
  ]
})

const rangeLabel = computed(() => RANGE_LABEL[ui.range])

function openCell(c: CellRow) {
  ui.cellDetail = c
}

function exportCsv() {
  const d = data.value
  if (!d) {
    toast('warn', '数据还未就绪', '请稍后再试')
    return
  }
  const rows: (string | number)[][] = [
    ['指标', '数值', '环比%'],
    ['统计范围', ui.region === 'all' ? '全国' : ui.region, ''],
    ['时间范围', rangeLabel.value, ''],
    ['总流量(字节)', d.kpi.totalBytes, d.kpi.delta.total],
    ['活跃用户', d.kpi.activeUsers, d.kpi.delta.users],
    ['峰值速率(bps)', d.kpi.peakBps, d.kpi.delta.peak],
    ['5G分流比(%)', d.kpi.fiveGShare, d.kpi.delta.fiveG],
    ['忙时小区占比(%)', d.kpi.busyCellRatio, d.kpi.delta.busy],
    [],
    ['区域', '流量(字节)', '占比%'],
    ...d.regionShare.map((r) => [r.region, r.bytes, r.share.toFixed(2)])
  ]
  downloadFile(`运营总览_${rangeLabel.value}_${ui.region}.csv`, toCsv(rows))
  toast('success', '已导出 CSV', '可用 Excel 直接打开')
}

onMounted(() => window.addEventListener('telco:export', exportCsv))
onUnmounted(() => window.removeEventListener('telco:export', exportCsv))
</script>

<template>
  <div class="page">
    <div v-if="error" class="card error-card">
      <Icon name="alert" :size="22" />
      <div>
        <strong>数据加载失败</strong>
        <p>{{ error }}</p>
      </div>
      <button class="btn btn--primary" @click="run">重试</button>
    </div>

    <template v-else-if="data">
      <section class="kpi-grid" aria-label="核心指标">
        <KpiCard
          label="总流量"
          :value="total.value"
          :unit="total.unit"
          :delta="data.kpi.delta.total"
          icon="wifi"
          tone="blue"
          :spark="data.hourly"
        />
        <KpiCard
          label="活跃用户"
          :value="users"
          :unit="usersUnit"
          :delta="data.kpi.delta.users"
          icon="user"
          tone="teal"
          :spark="data.hourly"
        />
        <KpiCard
          label="峰值速率"
          :value="peak.value"
          :unit="peak.unit"
          :delta="data.kpi.delta.peak"
          icon="activity"
          tone="violet"
          :spark="data.hourly"
        />
        <KpiCard
          label="5G 分流比"
          :value="data.kpi.fiveGShare.toFixed(1)"
          unit="%"
          :delta="data.kpi.delta.fiveG"
          icon="zap"
          tone="amber"
          :spark="data.hourly"
        />
        <KpiCard
          label="忙时小区占比"
          :value="data.kpi.busyCellRatio.toFixed(1)"
          unit="%"
          :delta="data.kpi.delta.busy"
          icon="tower"
          tone="red"
          :spark="data.hourly"
          :positive-is-good="false"
        />
      </section>

      <div class="insights-head">
        <h2>关键洞察</h2>
        <span>基于当前筛选自动生成 · {{ rangeLabel }}</span>
      </div>

      <section class="insights" aria-label="关键结论">
        <div v-for="(it, i) in insights" :key="i" class="insight">
          <span class="insight-icon"><Icon :name="it.icon" :size="15" /></span>
          <div>
            <strong>{{ it.title }}</strong>
            <p>{{ it.desc }}</p>
          </div>
          <span class="insight-index">0{{ i + 1 }}</span>
        </div>
      </section>

      <div class="grid grid--main">
        <Panel title="24 小时流量趋势" :sub="`${ui.region === 'all' ? '全国' : ui.region} · ${rangeLabel} · 小时粒度`">
          <template #actions>
            <span class="legend-dot"><span class="dot" style="background: var(--primary)" />本期</span>
            <span v-if="ui.compare" class="legend-dot"><span class="dot" style="background: #a9b8d3" />上期</span>
            <button class="btn btn--sm" @click="router.push('/hourly')">
              明细<Icon name="chevron-right" :size="12" />
            </button>
          </template>
          <BaseChart :option="trendOption" height="288px" :replace-merge="['series']" />
        </Panel>

        <Panel title="区域流量分布" sub="按大区拆分 · 共 31 省">
          <template #actions>
            <button class="btn btn--sm" @click="router.push('/region')">
              地图<Icon name="chevron-right" :size="12" />
            </button>
          </template>
          <div class="donut-wrap">
            <BaseChart :option="donutOption" height="216px" />
            <ul class="donut-legend">
              <li v-for="(r, i) in data.regionShare" :key="r.region">
                <span class="dot" :style="{ background: chartPalette[i] }" />
                <span class="name">{{ r.region }}</span>
                <span class="val num">{{ r.share.toFixed(1) }}%</span>
                <span class="bytes num">{{ fmtBytes(r.bytes, 0) }}</span>
              </li>
            </ul>
          </div>
        </Panel>
      </div>

      <div class="grid grid--bottom">
        <Panel title="重点小区负载 TOP 5" sub="按忙时利用率排序，点击查看趋势" flush>
          <template #actions>
            <button class="btn btn--sm" @click="router.push('/cells')">
              全部小区<Icon name="chevron-right" :size="12" />
            </button>
          </template>
          <div class="table-wrap">
            <table class="table table--compact">
              <thead>
                <tr>
                  <th>小区</th>
                  <th>区域</th>
                  <th class="num">利用率</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in data.topCells" :key="c.id" class="row-click" @click="openCell(c)">
                  <td>
                    <div class="cell-name">{{ c.name }}</div>
                    <div class="cell-id mono">{{ c.id }} · {{ c.city }}</div>
                  </td>
                  <td>{{ c.region }}</td>
                  <td class="num">
                    <div class="util">
                      <span class="util-val num">{{ c.util.toFixed(1) }}%</span>
                      <span class="util-bar"><i :style="{ width: `${c.util}%`, background: c.status === '拥塞' ? 'var(--red)' : c.status === '预警' ? 'var(--amber)' : 'var(--primary)' }" /></span>
                    </div>
                  </td>
                  <td>
                    <span class="chip" :class="c.status === '拥塞' ? 'chip--red' : c.status === '预警' ? 'chip--amber' : 'chip--green'">{{ c.status }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="实时告警" sub="待处理优先，点击查看全部">
          <template #actions>
            <button class="btn btn--sm" @click="ui.alertsOpen = true">告警中心</button>
          </template>
          <ul class="alert-list">
            <li v-for="a in data.alerts.slice(0, 4)" :key="a.id" class="alert-item" @click="ui.alertsOpen = true">
              <span class="alert-level" :class="`is-${a.level}`">{{ a.level }}</span>
              <div class="alert-body">
                <p>{{ a.message }}</p>
                <span>{{ a.cellName }} · {{ a.time.slice(11) }}</span>
              </div>
              <Icon name="chevron-right" :size="14" class="alert-arrow" />
            </li>
          </ul>
          <div class="alert-foot">
            <span><span class="dot dot--pulse" style="color: var(--red)" />{{ data.alerts.filter((a) => a.status === '待处理').length }} 条待处理</span>
            <span class="muted">{{ data.alerts.length }} 条近期告警</span>
          </div>
        </Panel>
      </div>
    </template>

    <div v-else class="skeleton-page">
      <div class="kpi-grid">
        <div v-for="i in 5" :key="i" class="skeleton kpi-skel" />
      </div>
      <div class="grid grid--main">
        <div class="skeleton panel-skel" />
        <div class="skeleton panel-skel" />
      </div>
      <div class="grid grid--bottom">
        <div class="skeleton panel-skel" />
        <div class="skeleton panel-skel" />
      </div>
    </div>
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
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.insights-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin: 2px 2px -5px;
}

.insights-head h2 {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.insights-head span {
  font-size: 10.5px;
  color: var(--text-3);
}

.insights {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.insight {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.insight:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px) scale(1.008);
}

.insight-icon {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  background: var(--primary-soft);
  color: var(--primary);
  flex-shrink: 0;
}

.insight strong {
  font-size: 12.5px;
  font-weight: 600;
  display: block;
  letter-spacing: -0.01em;
}

.insight p {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 2px;
}

.insight-index {
  position: absolute;
  right: 10px;
  top: 6px;
  font-family: var(--mono);
  font-size: 10px;
  color: var(--border-strong);
}

.grid {
  display: grid;
  gap: 12px;
}

.grid--main {
  grid-template-columns: minmax(0, 1.85fr) minmax(0, 1fr);
}

.grid--bottom {
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
}

.legend-dot {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-3);
  margin-right: 4px;
}

.donut-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.donut-wrap > :first-child {
  width: 54%;
}

.donut-legend {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.donut-legend li {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-2);
}

.donut-legend .dot {
  width: 7px;
  height: 7px;
  border-radius: 2px;
}

.donut-legend .name {
  width: 34px;
  flex-shrink: 0;
}

.donut-legend .val {
  color: var(--text);
  font-weight: 600;
  width: 38px;
  text-align: right;
}

.donut-legend .bytes {
  color: var(--text-3);
  font-size: 10.5px;
  margin-left: auto;
}

.row-click {
  cursor: pointer;
}

.cell-name {
  font-size: 12px;
  color: var(--text);
  font-weight: 500;
}

.cell-id {
  font-size: 9.5px;
  color: var(--text-3);
  margin-top: 1px;
}

.util {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}

.util-val {
  font-size: 12px;
  color: var(--text);
  font-weight: 550;
}

.util-bar {
  width: 62px;
  height: 3px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
}

.util-bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
}

.alert-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.alert-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 4px;
  border-bottom: 1px dashed var(--border);
  cursor: pointer;
  border-radius: 6px;
}

.alert-item:hover {
  background: var(--surface-2);
}

.alert-item:last-child {
  border-bottom: 0;
}

.alert-level {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 5px;
  border-radius: 4px;
  background: var(--amber-soft);
  color: var(--amber);
}

.alert-level.is-严重 {
  background: var(--red-soft);
  color: var(--red);
}

.alert-level.is-提示 {
  background: var(--primary-soft);
  color: var(--primary);
}

.alert-body {
  min-width: 0;
  flex: 1;
}

.alert-body p {
  font-size: 12px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.alert-body span {
  font-size: 10.5px;
  color: var(--text-3);
}

.alert-arrow {
  color: var(--text-3);
  flex-shrink: 0;
}

.alert-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 4px 0;
  margin-top: 4px;
  border-top: 1px solid var(--border);
  font-size: 10.5px;
  color: var(--text-2);
}

.alert-foot span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.error-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 24px;
  color: var(--red);
}

.error-card strong {
  color: var(--text);
  font-size: 13px;
}

.error-card p {
  color: var(--text-3);
  font-size: 12px;
  margin-top: 2px;
}

.error-card .btn {
  margin-left: auto;
}

.skeleton-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.kpi-skel {
  height: 118px;
}

.panel-skel {
  height: 340px;
}

@media (max-width: 1280px) {
  .kpi-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .grid--main,
  .grid--bottom {
    grid-template-columns: minmax(0, 1fr);
  }

  .insights {
    grid-template-columns: 1fr;
  }
}
</style>
