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
import { axisLabel, C, gridBase, splitLine, tooltipBase } from '@/lib/chart'
import { readableUnit, tickRowsOption } from '@/lib/chartTemplates'
import { downloadFile, toCsv, toast, ui } from '@/stores/ui'

const router = useRouter()

const { data, error, loading, run } = useAsync(
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
    animationType: 'expand',
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
      axisTick: { show: true, interval: 0, length: 7, lineStyle: { color: C.border } },
      axisLabel: { ...axisLabel, interval: 'auto' }
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
        smooth: false,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 4,
        data: d.hourly,
        lineStyle: { width: 1.8, color: C.primary },
        itemStyle: { color: C.primary },
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
          itemStyle: { color: 'rgba(51,78,172,0.05)' },
          label: { show: false },
          data: [[{ xAxis: hours[Math.max(0, d.peakIndex - 1)] }, { xAxis: hours[Math.min(23, d.peakIndex + 1)] }]]
        }
      },
      ...(ui.compare
        ? [{
            name: '上期',
            type: 'line',
            smooth: false,
            showSymbol: true,
        symbol: 'circle',
        symbolSize: 4,
            data: d.compare,
            lineStyle: { width: 1.4, type: 'dashed', color: '#a9b8d3' },
            itemStyle: { color: '#fff', borderColor: '#a9b8d3', borderWidth: 1 }
          }]
        : [])
    ]
  } as any
})

const regionTickUnit = computed(() => readableUnit(Math.max(0, ...(data.value?.regionShare ?? []).map(row => row.bytes)) / 36))
const regionRankOption = computed(() => tickRowsOption((data.value?.regionShare ?? []).map(row => ({
  name: row.region, value: row.bytes, label: `${row.share.toFixed(1)}%`, detail: `${fmtBytes(row.bytes)} · ${row.share.toFixed(1)}%`,
})), regionTickUnit.value))

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

    <template v-else>
      <section class="kpi-grid" aria-label="核心指标">
        <KpiCard
          label="总流量"
          :loading="!data"
          :value="total.value"
          :unit="total.unit"
          :delta="data?.kpi.delta.total"
          icon="wifi"
          tone="blue"
        />
        <KpiCard
          label="活跃用户"
          :loading="!data"
          :value="users"
          :unit="usersUnit"
          :delta="data?.kpi.delta.users"
          icon="user"
          tone="teal"
        />
        <KpiCard
          label="峰值速率"
          :loading="!data"
          :value="peak.value"
          :unit="peak.unit"
          :delta="data?.kpi.delta.peak"
          icon="activity"
          tone="violet"
        />
      </section>

      <div class="metric-strip">
        <span>5G 分流比<strong class="num">{{ data?.kpi.fiveGShare.toFixed(1) ?? '—' }}%</strong></span>
        <span>忙时高负载占比<strong class="num">{{ data?.kpi.busyCellRatio.toFixed(1) ?? '—' }}%</strong></span>
        <span class="overview-note"><Icon name="clock" :size="14" />峰值出现在 {{ data ? peakLabel : '—' }}</span>
      </div>

      <div class="section-heading"><h2>流量表现</h2><p>{{ rangeLabel }} · {{ ui.region === 'all' ? '全国' : ui.region }}</p></div>
      <div class="grid grid--main">
        <Panel data-template="F2" title="24 小时流量趋势" :sub="`${ui.region === 'all' ? '全国' : ui.region} · ${rangeLabel} · 小时粒度`">
          <template #actions>
            <span class="legend-dot"><span class="dot" style="background: var(--primary)" />本期</span>
            <span v-if="ui.compare" class="legend-dot"><span class="dot" style="background: #a9b8d3" />上期</span>
            <button class="btn btn--sm" @click="router.push('/hourly')">
              明细<Icon name="chevron-right" :size="12" />
            </button>
          </template>
          <BaseChart :option="trendOption" :loading="loading && !data" height="290px" :replace-merge="['series']" />
          <p class="chart-note">每个点为一个小时的流量读数<span v-if="ui.compare"> · 空心点为上期</span></p>
        </Panel>

        <Panel data-template="F5" title="区域流量排名" sub="按流量排序 · 7 个大区">
          <template #actions>
            <button class="btn btn--sm" @click="router.push('/region')">
              地图<Icon name="chevron-right" :size="12" />
            </button>
          </template>
          <div class="region-lead"><strong v-text-reveal="Boolean(data)" class="num">{{ data?.regionShare[0]?.share.toFixed(1) ?? '—' }}<small>%</small></strong><span>{{ data?.regionShare[0]?.region ?? '—' }}贡献最多流量</span></div>
          <BaseChart :option="regionRankOption" :loading="loading && !data" height="224px" />
          <p class="chart-note">每刻度 {{ fmtBytes(regionTickUnit, 0) }} · 末刻度高度表示不足一格的余量</p>
        </Panel>
      </div>

      <div class="section-heading"><h2>需要关注</h2><p>高负载小区与近期告警</p></div>
      <div class="grid grid--bottom">
        <Panel title="重点小区负载 TOP 5" sub="按忙时利用率排序，点击查看趋势" :loading="loading && !data" flush>
          <template #actions>
            <button class="btn btn--sm" @click="router.push('/cells')">
              全部小区<Icon name="chevron-right" :size="12" />
            </button>
          </template>
          <div class="table-wrap" v-swap-reveal>
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
                <tr v-for="c in data?.topCells" :key="c.id" class="row-click" @click="openCell(c)">
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

        <Panel title="实时告警" sub="待处理优先，点击查看全部" :loading="loading && !data">
          <template #actions>
            <button class="btn btn--sm" @click="ui.alertsOpen = true">告警中心</button>
          </template>
          <ul class="alert-list">
            <li v-for="a in data?.alerts.slice(0, 4)" :key="a.id" class="alert-item" @click="ui.alertsOpen = true">
              <span class="alert-level" :class="`is-${a.level}`">{{ a.level }}</span>
              <div class="alert-body">
                <p>{{ a.message }}</p>
                <span>{{ a.cellName }} · {{ a.time.slice(11) }}</span>
              </div>
              <Icon name="chevron-right" :size="14" class="alert-arrow" />
            </li>
          </ul>
          <div class="alert-foot">
            <span><span class="dot dot--pulse" style="color: var(--red)" />{{ data?.alerts.filter((a) => a.status === '待处理').length ?? '—' }} 条待处理</span>
            <span class="muted">{{ data?.alerts.length ?? '—' }} 条近期告警</span>
          </div>
        </Panel>
      </div>
    </template>

  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.kpi-grid {
  display: grid;
  grid-template-columns: 1.15fr 1fr 1fr;
  gap: 24px;
}

.grid {
  display: grid;
  gap: 24px;
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
  gap: 24px;
}

.kpi-skel {
  height: 118px;
}

.panel-skel {
  height: 340px;
}

@media (max-width: 1120px) {
  .kpi-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .grid--main,
  .grid--bottom {
    grid-template-columns: minmax(0, 1fr);
  }

}

.kpi-grid > :first-child { background: var(--primary-soft); border-color: var(--primary-border); }
.overview-note { margin-left: auto; display: inline-flex; align-items: center; gap: 7px; color: var(--text-3); }
.region-lead { display: flex; align-items: baseline; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
.region-lead strong { font-size: 32px; font-weight: 650; letter-spacing: -.04em; }
.region-lead small { font-size: 16px; margin-left: 3px; }
.region-lead > span { font-size: 12px; color: var(--text-3); }
.alert-item { padding: 14px 4px; }
@media (max-width: 680px) { .kpi-grid { grid-template-columns: 1fr; gap: 14px; } .overview-note { margin-left: 0; } }

</style>
