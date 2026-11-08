<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Panel from '@/components/Panel.vue'
import BaseChart from '@/components/BaseChart.vue'
import Icon from '@/components/Icon.vue'
import Modal from '@/components/Modal.vue'
import { useAsync } from '@/lib/useAsync'
import { api } from '@/api/client'
import type { CellRow } from '@/api/types'
import { fmtBytes, fmtCount, fmtRate } from '@/lib/format'
import { axisLabel, C, splitLine, tooltipBase } from '@/lib/chart'
import { downloadFile, toCsv, toast, ui } from '@/stores/ui'

const route = useRoute()
const q = ref('')
const gen = ref<'all' | '5G' | '4G'>('all')
const status = ref<'all' | '正常' | '预警' | '拥塞'>('all')
const sortKey = ref<'util' | 'traffic' | 'users'>('util')
const sortDir = ref(-1)
const page = ref(1)
const pageSize = 10
const expandOpen = ref(false)

const { data, error, run } = useAsync(
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

const histogram = computed(() => {
  const buckets = Array.from({ length: 10 }, (_, i) => ({ label: `${i * 10}-${i * 10 + 10}`, count: 0 }))
  for (const c of rows.value) {
    const idx = Math.min(9, Math.floor(c.util / 10))
    buckets[idx].count++
  }
  return buckets
})

const histOption = computed(() => ({
  animationDuration: 400,
  grid: { left: 6, right: 6, top: 22, bottom: 0, containLabel: true },
  tooltip: { ...tooltipBase, formatter: (p: any) => `${p.name}%<br/><b>${p.value} 个小区</b>` },
  xAxis: {
    type: 'category',
    data: histogram.value.map((b) => b.label),
    axisLine: { lineStyle: { color: C.border } },
    axisTick: { show: false },
    axisLabel: { ...axisLabel, fontSize: 9.5, interval: 0 }
  },
  yAxis: { type: 'value', splitLine, axisLabel: { ...axisLabel, fontSize: 9.5 } },
  series: [
    {
      type: 'bar',
      data: histogram.value.map((b, i) => ({
        value: b.count,
        itemStyle: {
          color: i * 10 >= ui.settings.congest ? C.red : i * 10 >= ui.settings.warn ? C.amber : C.primary,
          opacity: 0.85,
          borderRadius: [3, 3, 0, 0]
        }
      })),
      barWidth: '62%'
    }
  ]
}))

const scatterCells = computed(() => rows.value.filter((c) => c.status !== '正常').concat(rows.value.filter((c) => c.status === '正常')).slice(0, 260))
const maxTraffic = computed(() => Math.max(1, ...rows.value.map((c) => c.traffic)))

const scatterOption = computed(() => ({
  animationDuration: 500,
  grid: { left: 6, right: 14, top: 20, bottom: 2, containLabel: true },
  tooltip: {
    ...tooltipBase,
    formatter: (p: any) => {
      const c = p.data.cell as CellRow
      return `<div style="font-weight:600;margin-bottom:3px">${c.name}</div>
        <div>用户 ${fmtCount(c.users)} · 利用率 <b>${c.util.toFixed(1)}%</b></div>
        <div>带宽 ${fmtRate(c.bandwidthMbps * 1e6)} · ${c.generation}</div>`
    }
  },
  xAxis: {
    type: 'value',
    name: '用户数',
    nameLocation: 'middle',
    nameGap: 22,
    nameTextStyle: { fontSize: 9.5, color: C.axis },
    splitLine,
    axisLabel: { ...axisLabel, fontSize: 9.5, formatter: (v: number) => fmtCount(v) }
  },
  yAxis: {
    type: 'value',
    min: 0,
    max: 100,
    name: '利用率 %',
    nameLocation: 'middle',
    nameGap: 30,
    nameTextStyle: { fontSize: 9.5, color: C.axis },
    splitLine,
    axisLabel: { ...axisLabel, fontSize: 9.5, formatter: '{value}' }
  },
  series: [
    {
      type: 'scatter',
      data: scatterCells.value.map((c) => ({
        value: [c.users, c.util, c.traffic],
        cell: c,
        itemStyle: { color: c.generation === '5G' ? '#1f5eff' : '#6d5ce7', opacity: 0.55, borderColor: '#fff', borderWidth: 0.8 }
      })),
      symbolSize: (v: any) => 4 + Math.sqrt(v[2] / maxTraffic.value) * 15,
      emphasis: { itemStyle: { opacity: 1 }, scale: 1.4 },
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: C.amber, type: 'dashed', width: 1 },
        label: { formatter: '预警', color: C.amber, fontSize: 9, position: 'insideEndTop' },
        data: [{ yAxis: ui.settings.warn }]
      }
    },
    {
      type: 'scatter',
      data: [],
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: C.red, type: 'dashed', width: 1 },
        label: { formatter: '拥塞', color: C.red, fontSize: 9, position: 'insideEndTop' },
        data: [{ yAxis: ui.settings.congest }]
      }
    }
  ]
}) as any)

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

onMounted(() => window.addEventListener('telco:export', exportCsv))
onUnmounted(() => window.removeEventListener('telco:export', exportCsv))
</script>

<template>
  <div v-if="error" class="card error-card">
    <Icon name="alert" :size="22" />
    <div><strong>小区数据加载失败</strong><p>{{ error }}</p></div>
    <button class="btn btn--primary" @click="run">重试</button>
  </div>

  <div v-else-if="data" class="page">
    <section class="stats">
      <button class="stat" :class="{ 'is-active': status === 'all' }" @click="status = 'all'">
        <span class="stat-icon blue"><Icon name="tower" :size="16" /></span>
        <div><span>重点小区</span><strong class="num">{{ summary.total }}</strong></div>
        <span class="stat-sub">平均利用率 {{ summary.avgUtil.toFixed(1) }}%</span>
      </button>
      <button class="stat" :class="{ 'is-active': status === '预警' }" @click="setStatus('预警')">
        <span class="stat-icon amber"><Icon name="alert" :size="16" /></span>
        <div><span>预警小区</span><strong class="num">{{ summary.warning }}</strong></div>
        <span class="stat-sub">利用率 ≥ {{ ui.settings.warn }}%</span>
      </button>
      <button class="stat" :class="{ 'is-active': status === '拥塞' }" @click="setStatus('拥塞')">
        <span class="stat-icon red"><Icon name="zap" :size="16" /></span>
        <div><span>拥塞小区</span><strong class="num">{{ summary.congested }}</strong></div>
        <span class="stat-sub">利用率 ≥ {{ ui.settings.congest }}%</span>
      </button>
      <button class="stat" @click="expandOpen = true">
        <span class="stat-icon green"><Icon name="sparkles" :size="16" /></span>
        <div><span>可扩容</span><strong class="num">{{ summary.expandable }}</strong></div>
        <span class="stat-sub">生成扩容建议 →</span>
      </button>
    </section>

    <div class="grid grid--charts">
      <Panel title="利用率分布" sub="按 10% 区间分桶，颜色对应阈值">
        <BaseChart :option="histOption" height="220px" />
      </Panel>
      <Panel title="用户数 × 利用率" sub="气泡大小表示日流量，点击查看小区">
        <template #actions>
          <span class="legend"><i style="background: #1f5eff" />5G</span>
          <span class="legend"><i style="background: #6d5ce7" />4G</span>
        </template>
        <BaseChart :option="scatterOption" height="220px" @chart-click="onScatterClick" />
      </Panel>
    </div>

    <Panel title="小区清单" :sub="`${filtered.length} 个小区 · 点击行查看详情`" flush>
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
          <select v-model="status" class="input select" aria-label="按状态筛选">
            <option value="all">全部状态</option>
            <option value="正常">正常</option>
            <option value="预警">预警</option>
            <option value="拥塞">拥塞</option>
          </select>
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

  <div v-else class="skeleton-page">
    <div class="skeleton stats-skel" />
    <div class="grid grid--charts"><div class="skeleton chart-skel" /><div class="skeleton chart-skel" /></div>
    <div class="skeleton table-skel" />
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
.page { display: flex; flex-direction: column; gap: 12px; }

.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }

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

.grid { display: grid; gap: 12px; }
.grid--charts { grid-template-columns: 1fr 1fr; }

.legend { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; color: var(--text-3); margin-left: 6px; }
.legend i { width: 7px; height: 7px; border-radius: 2px; display: block; }

.filters { display: flex; align-items: center; gap: 8px; }
.search { position: relative; }
.search svg { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); color: var(--text-3); }
.search .input { width: 200px; height: 30px; padding-left: 28px; font-size: 12px; }
.select { height: 30px; width: 100px; font-size: 12px; }
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

.skeleton-page { display: flex; flex-direction: column; gap: 12px; }
.stats-skel { height: 84px; }
.chart-skel { height: 280px; }
.table-skel { height: 420px; }

@media (max-width: 1280px) {
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .grid--charts { grid-template-columns: 1fr; }
}
</style>
