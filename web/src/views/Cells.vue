<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { EChartsOption } from 'echarts'
import { useRoute } from 'vue-router'
import Panel from '@/components/Panel.vue'
import BaseChart from '@/components/BaseChart.vue'
import Icon from '@/components/Icon.vue'
import Modal from '@/components/Modal.vue'
import Select from '@/components/Select.vue'
import { useAsync } from '@/lib/useAsync'
import { api } from '@/api/client'
import type { CellRow } from '@/api/types'
import { fmtBytes, fmtCount, fmtRate } from '@/lib/format'
import { axisLabel, C, splitLine, tooltipBase } from '@/lib/chart'
import { utilizationHistogram } from '@/lib/chartTemplates'
import { ScatterMotion } from '@/lib/scatterMotion'
import { downloadFile, toCsv, toast, ui } from '@/stores/ui'

const route = useRoute()
const q = ref('')
const gen = ref<'all' | '5G' | '4G'>('all')
const status = ref<'all' | '正常' | '预警' | '拥塞'>('all')
const statusOptions: { value: typeof status.value; label: string }[] = [
  { value: 'all', label: '全部状态' },
  { value: '正常', label: '正常' },
  { value: '预警', label: '预警' },
  { value: '拥塞', label: '拥塞' }
]
const sortKey = ref<'util' | 'traffic' | 'users'>('util')
const sortDir = ref(-1)
const page = ref(1)
const pageSize = 10
const expandOpen = ref(false)
const scatterView = ref<'strip' | 'users'>('strip')
const scatterPanel = ref<InstanceType<typeof Panel> | null>(null)
const scatterChart = ref<InstanceType<typeof BaseChart> | null>(null)
const reduceMotion = ref(false)
const animateScatter = ref(true)
let scatterMotion: ScatterMotion | null = null
let switchVersion = 0
let motionPreference: MediaQueryList | null = null
function syncMotionPreference() {
  reduceMotion.value = motionPreference?.matches ?? false
  if (reduceMotion.value) scatterMotion?.finish()
}
async function switchScatter(view: 'strip' | 'users', event: MouseEvent) {
  if (view === scatterView.value) return
  const version = ++switchVersion
  const chart = scatterChart.value?.getChart()
  scatterChart.value?.finishLoadingMotion()
  const root = scatterPanel.value?.$el as HTMLElement | undefined
  const animate = event.detail > 0 && !reduceMotion.value && root && chart && !chart.isDisposed()
  animateScatter.value = Boolean(animate)
  if (animate) {
    scatterMotion ??= new ScatterMotion(root)
    scatterMotion.prepare(chart, scatterView.value)
  } else scatterMotion?.finish()
  scatterView.value = view
  await nextTick()
  if (version !== switchVersion || !chart || chart.isDisposed()) return
  if (animate) {
    try { scatterMotion?.commit(chart, view) }
    catch { scatterMotion?.finish() }
  }
}

const { data, error, loading, run } = useAsync(
  () => api.cells(ui.range, ui.region, ui.settings.warn, ui.settings.congest),
  () => [ui.range, ui.region, ui.tick, ui.settings.warn, ui.settings.congest]
)

const rows = computed<CellRow[]>(() => data.value?.rows ?? [])

const filtered = computed(() => {
  let list = rows.value
  if (gen.value !== 'all') list = list.filter((c) => c.generation === gen.value)
  if (status.value !== 'all') list = list.filter((c) => c.status === status.value)
  const k = q.value.trim()
  if (k) list = list.filter((c) => c.name.includes(k) || c.id.toLowerCase().includes(k.toLowerCase()) || c.city.includes(k))
  return [...list].sort((a, b) => {
    const av = sortKey.value === 'traffic' ? a.traffic : a[sortKey.value]
    const bv = sortKey.value === 'traffic' ? b.traffic : b[sortKey.value]
    return (av - bv) * sortDir.value
  })
})

const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))

watch([gen, status, q, sortKey, sortDir, () => ui.range, () => ui.region], () => {
  page.value = 1
})

watch(pageCount, (n) => {
  if (page.value > n) page.value = n
})

watch(data, (d) => {
  const target = route.query.cell as string | undefined
  if (target && d && !ui.cellDetail) {
    const c = d.rows.find((x) => x.id === target)
    if (c) ui.cellDetail = c
  }
})

const summary = computed(() => data.value?.summary ?? { total: 0, warning: 0, congested: 0, expandable: 0, avgUtil: 0 })

const histogram = computed(() => utilizationHistogram(rows.value.map(cell => cell.util), ui.settings.warn, ui.settings.congest))
const histOption = computed(() => histogram.value.option)
const maxTraffic = computed(() => Math.max(1, ...rows.value.map(cell => cell.traffic)))
function stableJitter(id: string) {
  let hash = 2166136261
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return ((hash >>> 0) % 1000 / 999 - .5) * .58
}
const scatterOption = computed(() => {
  const strip = scatterView.value === 'strip'
  const threshold = (value: number, name: string, color: string) => ({
    ...(strip ? { xAxis: value } : { yAxis: value }), lineStyle: { color }, label: { formatter: name, color },
  })
  return {
    animationDuration: 350,
    animation: !reduceMotion.value,
    animationDurationUpdate: animateScatter.value && !reduceMotion.value ? 460 : 0,
    animationEasingUpdate: 'cubicInOut',
    grid: { left: strip ? 36 : 4, right: 18, top: 28, bottom: 28, containLabel: true },
    tooltip: { ...tooltipBase, formatter: (p: any) => {
      const cell = p.data.cell as CellRow
      if (!cell) return ''
      return `${cell.name}<br/>${cell.generation} · 利用率 <b>${cell.util.toFixed(1)}%</b><br/>用户 ${fmtCount(cell.users)} · 日流量 ${fmtBytes(cell.traffic)}`
    } },
    xAxis: strip ? {
      id: 'cell-x', type: 'value', animation: false, min: 0, max: 100, interval: 20, splitLine: { ...splitLine, show: true }, axisLine: { show: true, lineStyle: { color: '#a3afc0' } }, axisTick: { show: false }, axisLabel: { ...axisLabel, show: true, formatter: '{value}%' },
    } : {
      id: 'cell-x', type: 'value', animation: false, min: 0, max: null, interval: null, splitLine: { ...splitLine, show: true }, axisLine: { show: true, lineStyle: { color: '#a3afc0' } }, axisTick: { show: false }, axisLabel: { ...axisLabel, show: true, formatter: (value: number) => fmtCount(value) },
    },
    yAxis: strip ? {
      id: 'cell-y', type: 'value', animation: false, min: -.6, max: 1.6, interval: null, splitLine: { show: false }, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false },
    } : {
      id: 'cell-y', type: 'value', animation: false, min: 0, max: 100, interval: 20, splitLine: { ...splitLine, show: true }, axisLine: { show: true, lineStyle: { color: '#a3afc0' } }, axisLabel: { ...axisLabel, show: true, formatter: '{value}%' },
    },
    series: [{
      id: 'cell-records', type: 'scatter', name: '小区',
      data: rows.value.map(cell => ({
        id: cell.id, name: cell.name, cell, value: strip ? [cell.util, (cell.generation === '5G' ? 1 : 0) + stableJitter(cell.id), cell.traffic] : [cell.users, cell.util, cell.traffic],
        itemStyle: { color: cell.status === '拥塞' ? C.red : cell.generation === '5G' ? C.primary : '#7096d1', opacity: strip ? .68 : .5, borderColor: '#fff', borderWidth: .6 },
      })),
      symbolSize: strip ? 5.5 : (value: any) => 4 + Math.sqrt(value[2] / maxTraffic.value) * 14,
      emphasis: { scale: 1.45, itemStyle: { opacity: 1 } },
      markLine: { animation: false, silent: true, symbol: 'none', lineStyle: { type: 'dashed', width: 1 }, label: { fontSize: 10, position: strip ? 'end' : 'insideEndTop', rotate: 0 }, data: [threshold(ui.settings.warn, '预警', C.amber), threshold(ui.settings.congest, '拥塞', C.red)] },
    }, {
      id: 'generation-labels', type: 'scatter', animation: false, silent: true, symbolSize: 0, clip: false,
      data: strip ? [{ value: [0, 0], label: { formatter: '4G' } }, { value: [0, 1], label: { formatter: '5G' } }] : [],
      label: { show: true, position: 'left', distance: 12, color: C.text2, fontSize: 11, fontWeight: 600 },
    }],
  } as any
})

const suggestions = computed(() =>
  [...rows.value]
    .filter((c) => c.util >= ui.settings.warn)
    .sort((a, b) => b.util - a.util)
    .slice(0, 8)
    .map((c) => ({
      cell: c,
      action: c.util >= ui.settings.congest
        ? '新增 1 个载波 / 调整邻区负载'
        : c.generation === '5G' ? '扩容 1 个 5G 载波' : '升级为 5G 室分',
      relieve: Math.min(30, Math.round(c.util - ui.settings.warn + 8)),
      priority: c.util >= ui.settings.congest ? '高' : '中'
    }))
)

function setSort(k: typeof sortKey.value) {
  if (sortKey.value === k) sortDir.value *= -1
  else {
    sortKey.value = k
    sortDir.value = -1
  }
}

function openCell(c: CellRow) {
  ui.cellDetail = c
}

function onScatterClick(p: any) {
  if (p?.data?.cell) openCell(p.data.cell)
}

function setStatus(s: typeof status.value) {
  status.value = status.value === s ? 'all' : s
}

function exportCsv() {
  const header = ['小区编号', '小区名称', '大区', '省份', '城市', '制式', '带宽Mbps', '用户数', '流量(字节)', '忙时利用率%', '状态']
  const body = filtered.value.map((c) => [c.id, c.name, c.region, c.province, c.city, c.generation, c.bandwidthMbps, c.users, c.traffic, c.util, c.status])
  downloadFile(`资源与扩容_${ui.range}_${ui.region}.csv`, toCsv([header, ...body]))
  toast('success', '已导出 CSV', `${body.length} 个小区`)
}

function exportPlan() {
  const header = ['小区编号', '小区名称', '当前利用率%', '建议动作', '优先级', '预计缓解百分点']
  const body = suggestions.value.map((s) => [s.cell.id, s.cell.name, s.cell.util, s.action, s.priority, s.relieve])
  downloadFile('扩容建议.csv', toCsv([header, ...body]))
  toast('success', '扩容建议已导出', `${body.length} 条建议，可直接转工单`)
}

function dispatchPlan() {
  toast('success', '工单已创建', `共 ${suggestions.value.length} 条扩容建议已下发给网络优化班组`)
  expandOpen.value = false
}

watch(scatterPanel, panel => { if (!panel) { scatterMotion?.dispose(); scatterMotion = null } })
onMounted(() => {
  window.addEventListener('telco:export', exportCsv)
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  syncMotionPreference()
  motionPreference.addEventListener('change', syncMotionPreference)
})
onUnmounted(() => {
  switchVersion++
  window.removeEventListener('telco:export', exportCsv)
  motionPreference?.removeEventListener('change', syncMotionPreference)
  scatterMotion?.dispose()
})
</script>

<template>
  <div v-if="error" class="card error-card">
    <Icon name="alert" :size="22" />
    <div><strong>小区数据加载失败</strong><p>{{ error }}</p></div>
    <button class="btn btn--primary" @click="run">重试</button>
  </div>

  <div v-else class="page">
    <section class="stats">
      <button class="stat" :class="{ 'is-active': status === 'all' }" @click="status = 'all'">
        <span class="stat-icon blue"><Icon name="tower" :size="16" /></span>
        <div><span>重点小区</span><strong v-liquid="Boolean(data)" class="num">{{ data ? summary.total : '—' }}</strong></div>
        <span class="stat-sub">平均利用率 {{ summary.avgUtil.toFixed(1) }}%</span>
      </button>
      <button class="stat" :class="{ 'is-active': status === '预警' }" @click="setStatus('预警')">
        <span class="stat-icon amber"><Icon name="alert" :size="16" /></span>
        <div><span>预警小区</span><strong v-liquid="Boolean(data)" class="num">{{ data ? summary.warning : '—' }}</strong></div>
        <span class="stat-sub">利用率 ≥ {{ ui.settings.warn }}%</span>
      </button>
      <button class="stat" :class="{ 'is-active': status === '拥塞' }" @click="setStatus('拥塞')">
        <span class="stat-icon red"><Icon name="zap" :size="16" /></span>
        <div><span>拥塞小区</span><strong v-liquid="Boolean(data)" class="num">{{ data ? summary.congested : '—' }}</strong></div>
        <span class="stat-sub">利用率 ≥ {{ ui.settings.congest }}%</span>
      </button>
      <button class="stat" @click="expandOpen = true">
        <span class="stat-icon green"><Icon name="sparkles" :size="16" /></span>
        <div><span>可扩容</span><strong v-liquid="Boolean(data)" class="num">{{ data ? summary.expandable : '—' }}</strong></div>
        <span class="stat-sub">生成扩容建议 →</span>
      </button>
    </section>

    <div class="section-heading"><h2>网络负载概况</h2><p>分布与用户规模共同判断扩容优先级</p></div>
    <div class="grid grid--charts">
      <Panel data-template="F14" title="利用率分布" sub="每 5% 为一个连续区间 · 每横档为 1 个小区">
        <BaseChart :option="histOption" :loading="loading && !data" height="250px" :replace-merge="['series']" />
        <p class="chart-note">{{ rows.length }} 个小区完整分布 · 中位利用率 {{ histogram.median.toFixed(1) }}%</p>
      </Panel>
      <Panel ref="scatterPanel" class="scatter-panel" :data-template="scatterView === 'strip' ? 'G15' : 'G9'" :title="scatterView === 'strip' ? '按网络制式看利用率' : '用户数 × 利用率'" :sub="scatterView === 'strip' ? '每点为一个小区 · 纵向错开仅用于辨认' : '气泡面积表示日流量 · 点击查看小区'">
        <template #actions>
          <div class="seg seg--sm" role="group" aria-label="图表维度"><button class="seg__item" :class="{ 'is-active': scatterView === 'strip' }" :aria-pressed="scatterView === 'strip'" @click="switchScatter('strip', $event)">制式分布</button><button class="seg__item" :class="{ 'is-active': scatterView === 'users' }" :aria-pressed="scatterView === 'users'" @click="switchScatter('users', $event)">用户规模</button></div>
        </template>
        <BaseChart ref="scatterChart" :option="scatterOption" :loading="loading && !data" height="250px" :replace-merge="['series', 'xAxis', 'yAxis']" @chart-click="onScatterClick" />
        <p class="chart-note">展示全部 {{ rows.length }} 个小区 · 红点为拥塞小区</p>
      </Panel>
    </div>

    <div class="section-heading"><h2>定位与处理</h2><p>先筛选目标小区，再生成扩容建议</p></div>
    <Panel class="cells-table" title="小区清单" :sub="`${filtered.length} 个小区 · 点击行查看详情`" :loading="loading && !data" flush>
      <template #actions>
        <div class="filters">
          <div class="search">
            <Icon name="search" :size="14" />
            <input v-model="q" class="input" placeholder="搜索小区 / 城市 / 编号" aria-label="搜索小区" />
          </div>
          <div class="seg seg--sm">
            <button class="seg__item" :class="{ 'is-active': gen === 'all' }" @click="gen = 'all'">全部</button>
            <button class="seg__item" :class="{ 'is-active': gen === '5G' }" @click="gen = '5G'">5G</button>
            <button class="seg__item" :class="{ 'is-active': gen === '4G' }" @click="gen = '4G'">4G</button>
          </div>
          <Select v-model="status" class="select" size="sm" :options="statusOptions" aria-label="按状态筛选" />
          <button class="btn btn--soft" @click="expandOpen = true">
            <Icon name="sparkles" :size="14" />
            生成扩容建议
          </button>
        </div>
      </template>

      <div class="table-wrap">
        <table class="table table--compact">
          <thead>
            <tr>
              <th>小区</th>
              <th>区域 / 城市</th>
              <th>制式</th>
              <th class="num">带宽</th>
              <th class="num sortable" @click="setSort('users')">用户 <span class="sort">{{ sortKey === 'users' ? (sortDir < 0 ? '↓' : '↑') : '↕' }}</span></th>
              <th class="num sortable" @click="setSort('traffic')">日流量 <span class="sort">{{ sortKey === 'traffic' ? (sortDir < 0 ? '↓' : '↑') : '↕' }}</span></th>
              <th class="num sortable" @click="setSort('util')">忙时利用率 <span class="sort">{{ sortKey === 'util' ? (sortDir < 0 ? '↓' : '↑') : '↕' }}</span></th>
              <th>状态</th>
              <th class="w-60" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in paged" :key="c.id" class="row-click" @click="openCell(c)">
              <td>
                <div class="cell-name">{{ c.name }}</div>
                <div class="cell-id mono">{{ c.id }}</div>
              </td>
              <td>{{ c.region }} / {{ c.city }}</td>
              <td><span class="chip" :class="c.generation === '5G' ? 'chip--blue' : 'chip--violet'">{{ c.generation }}</span></td>
              <td class="num">{{ fmtRate(c.bandwidthMbps * 1e6) }}</td>
              <td class="num">{{ fmtCount(c.users) }}</td>
              <td class="num">{{ fmtBytes(c.traffic, 0) }}</td>
              <td class="num">
                <div class="util">
                  <span class="num">{{ c.util.toFixed(1) }}%</span>
                  <span class="util-bar"><i :style="{ width: `${c.util}%`, background: c.status === '拥塞' ? 'var(--red)' : c.status === '预警' ? 'var(--amber)' : 'var(--primary)' }" /></span>
                </div>
              </td>
              <td><span class="chip" :class="c.status === '拥塞' ? 'chip--red' : c.status === '预警' ? 'chip--amber' : 'chip--green'">{{ c.status }}</span></td>
              <td><Icon name="chevron-right" :size="14" class="muted" /></td>
            </tr>
            <tr v-if="!paged.length">
              <td colspan="9" class="empty-cell">没有符合筛选条件的小区</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pager">
        <span class="muted">共 {{ filtered.length }} 条 · 第 {{ page }} / {{ pageCount }} 页</span>
        <div class="pager-btns">
          <button class="btn btn--sm" :disabled="page <= 1" @click="page--"><Icon name="chevron-left" :size="13" />上一页</button>
          <button class="btn btn--sm" :disabled="page >= pageCount" @click="page++">下一页<Icon name="chevron-right" :size="13" /></button>
        </div>
      </div>
    </Panel>
  </div>


  <Modal :open="expandOpen" title="扩容建议" :sub="`基于 ${ui.range === 'today' ? '今日' : ui.range === '7d' ? '近 7 天' : '近 30 天'}忙时利用率，共 ${suggestions.length} 条`" width="720px" @close="expandOpen = false">
    <div class="plan-tip">
      <Icon name="info" :size="14" />
      建议规则：利用率 ≥ {{ ui.settings.congest }}% 优先扩容或调整邻区；≥ {{ ui.settings.warn }}% 纳入本周扩容窗口。
    </div>
    <div class="table-wrap">
      <table class="table table--compact">
        <thead>
          <tr><th>小区</th><th class="num">利用率</th><th>建议动作</th><th>优先级</th><th class="num">预计缓解</th></tr>
        </thead>
        <tbody>
          <tr v-for="s in suggestions" :key="s.cell.id">
            <td>
              <div class="cell-name">{{ s.cell.name }}</div>
              <div class="cell-id mono">{{ s.cell.id }}</div>
            </td>
            <td class="num">{{ s.cell.util.toFixed(1) }}%</td>
            <td>{{ s.action }}</td>
            <td><span class="chip" :class="s.priority === '高' ? 'chip--red' : 'chip--amber'">{{ s.priority }}</span></td>
            <td class="num">-{{ s.relieve }} pp</td>
          </tr>
        </tbody>
      </table>
    </div>
    <template #footer>
      <button class="btn" @click="exportPlan"><Icon name="download" :size="14" />导出建议</button>
      <button class="btn" @click="expandOpen = false">取消</button>
      <button class="btn btn--primary" @click="dispatchPlan"><Icon name="check" :size="14" />下发工单</button>
    </template>
  </Modal>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 24px; }

.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px; }

.stat {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 13px 15px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  text-align: left;
  box-shadow: var(--shadow-sm);
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
  position: relative;
}

.stat:hover { border-color: var(--border-strong); box-shadow: var(--shadow-md); transform: translateY(-1px) scale(1.01); }
.stat.is-active { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary) inset; }

.stat-icon { width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; flex-shrink: 0; }
.stat-icon.blue { background: var(--primary-soft); color: var(--primary); }
.stat-icon.amber { background: var(--amber-soft); color: var(--amber); }
.stat-icon.red { background: var(--red-soft); color: var(--red); }
.stat-icon.green { background: var(--green-soft); color: var(--green); }

.stat > div { display: flex; flex-direction: column; line-height: 1.25; }
.stat > div span { font-size: 10.5px; color: var(--text-3); }
.stat > div strong { font-size: 20px; font-weight: 650; letter-spacing: -0.02em; }
.stat-sub { position: absolute; right: 13px; top: 14px; font-size: 9.5px; color: var(--text-3); }

.grid { display: grid; gap: 24px; }
.grid--charts { grid-template-columns: 1fr 1fr; }

.legend { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; color: var(--text-3); margin-left: 6px; }
.legend i { width: 7px; height: 7px; border-radius: 2px; display: block; }

.filters { display: flex; align-items: center; gap: 8px; }
.search { position: relative; }
.search svg { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); color: var(--text-3); }
.search .input { width: 200px; height: 30px; padding-left: 28px; font-size: 12px; }
.select { width: 100px; }
.seg--sm .seg__item { height: 30px; padding: 0 9px; font-size: 11.5px; }

.cell-name { font-size: 12px; font-weight: 500; color: var(--text); }
.cell-id { font-size: 9.5px; color: var(--text-3); margin-top: 1px; }

.util { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.util-bar { width: 70px; height: 3px; border-radius: 999px; background: var(--surface-3); overflow: hidden; }
.util-bar i { display: block; height: 100%; border-radius: 999px; }

.row-click { cursor: pointer; }
.w-60 { width: 40px; }
.empty-cell { text-align: center; color: var(--text-3); padding: 26px; }

.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  font-size: 11px;
}

.pager-btns { display: flex; gap: 6px; }

.plan-tip {
  display: flex;
  gap: 7px;
  align-items: flex-start;
  padding: 9px 11px;
  background: var(--primary-soft);
  border-radius: 8px;
  font-size: 11px;
  color: var(--text-2);
  line-height: 1.55;
  margin-bottom: 12px;
}

.plan-tip svg { color: var(--primary); flex-shrink: 0; margin-top: 1px; }

.error-card { display: flex; align-items: center; gap: 14px; padding: 24px; color: var(--red); }
.error-card strong { color: var(--text); font-size: 13px; }
.error-card p { color: var(--text-3); font-size: 12px; margin-top: 2px; }
.error-card .btn { margin-left: auto; }

.skeleton-page { display: flex; flex-direction: column; gap: 24px; }
.stats-skel { height: 84px; }
.chart-skel { height: 280px; }
.table-skel { height: 420px; }

@media (max-width: 1120px) {
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .grid--charts { grid-template-columns: 1fr; }
}

.stats { gap: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.stat { border: 0; border-radius: 0; box-shadow: none; background: transparent; padding: 24px; min-height: 122px; }
.stat + .stat { border-left: 1px solid var(--border); }
.stat:hover { transform: none; box-shadow: none; }
.stat-sub { font-size: 11px; }
@media (max-width: 1180px) {
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stat { padding: 20px 16px; }
  .stat:nth-child(3) { border-left: 0; border-top: 1px solid var(--border); }
  .stat:nth-child(4) { border-top: 1px solid var(--border); }
}

.stat { display: grid; grid-template-columns: 32px 1fr; align-content: center; gap: 8px 12px; text-align: left; }
.stat-icon { grid-row: 1 / 3; }
.stat-sub { position: static; grid-column: 2; }
.stat > div strong { font-size: 28px; margin-top: 5px; }
.stat > div span { font-size: 12px; }
.stat.is-active { background: var(--primary-soft); box-shadow: inset 0 -3px 0 var(--primary); }
.cells-table :deep(.panel-head) { flex-direction: column; align-items: stretch; }
.cells-table :deep(.panel-actions) { width: 100%; }
.filters { width: 100%; flex-wrap: wrap; gap: 10px; }
.filters > .btn { margin-left: auto; }
.search { flex: 1; min-width: 180px; max-width: 320px; }
.search .input { width: 100%; }
@media (max-width: 680px) { .filters > .btn { margin-left: 0; } .search { max-width: none; flex-basis: 100%; } }

.scatter-panel { position: relative; isolation: isolate; overflow: hidden; }
.scatter-panel :deep(.panel-head) { flex-wrap: wrap; align-items: flex-start; }
.scatter-panel :deep(.panel-head > div:first-child) { flex: 1; min-width: min(100%, 180px); }
.scatter-panel :deep(.panel-sub) { min-height: 36px; line-height: 18px; }
.scatter-panel[data-motion="running"] :deep(.chart-box) { pointer-events: none; }
</style>
