<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import * as echarts from 'echarts'
import { useRouter } from 'vue-router'
import Panel from '@/components/Panel.vue'
import BaseChart from '@/components/BaseChart.vue'
import Icon from '@/components/Icon.vue'
import { useAsync } from '@/lib/useAsync'
import { api } from '@/api/client'
import type { ProvinceRow } from '@/api/types'
import { fmtBytes, fmtCount, fmtDelta, fmtInt } from '@/lib/format'
import { axisLabel, C, chartPalette, tooltipBase } from '@/lib/chart'
import { downloadFile, toCsv, toast, ui } from '@/stores/ui'

const router = useRouter()
const mapReady = ref(false)
const mapError = ref('')
const metric = ref<'traffic' | 'users' | 'perUser' | 'growth'>('traffic')
const selected = ref<string | null>(null)
const q = ref('')
const regionFilter = ref<string>('全部')
const sortKey = ref<'traffic' | 'users' | 'perUser' | 'growth'>('traffic')
const sortDir = ref(-1)

const { data, error, loading, run } = useAsync(
  () => api.provinces(ui.range),
  () => [ui.range, ui.tick]
)

const rows = computed<ProvinceRow[]>(() => data.value ?? [])

const metricLabel: Record<string, string> = {
  traffic: '流量',
  users: '用户数',
  perUser: '人均流量',
  growth: '同比增速'
}

function metricValue(r: ProvinceRow) {
  if (metric.value === 'traffic') return r.trafficBytes
  if (metric.value === 'users') return r.users
  if (metric.value === 'perUser') return r.perUserBytes
  return r.growth
}

function metricText(r: ProvinceRow) {
  if (metric.value === 'traffic') return fmtBytes(r.trafficBytes, 0)
  if (metric.value === 'users') return fmtCount(r.users)
  if (metric.value === 'perUser') return fmtBytes(r.perUserBytes, 0)
  return `${r.growth > 0 ? '+' : ''}${r.growth.toFixed(1)}%`
}

const selectedRow = computed(() => rows.value.find((r) => r.province === selected.value) ?? null)
const selectedRank = computed(() => {
  if (!selectedRow.value) return 0
  const sorted = [...rows.value].sort((a, b) => b.trafficBytes - a.trafficBytes)
  return sorted.findIndex((r) => r.province === selectedRow.value?.province) + 1
})

const topByTraffic = computed(() => [...rows.value].sort((a, b) => b.trafficBytes - a.trafficBytes)[0])
const topByGrowth = computed(() => [...rows.value].filter((r) => r.trafficBytes > 1e14).sort((a, b) => b.growth - a.growth)[0])
const topByPerUser = computed(() => [...rows.value].sort((a, b) => b.perUserBytes - a.perUserBytes)[0])

const regionAgg = computed(() => {
  const map = new Map<string, { bytes: number; users: number; provinces: number }>()
  for (const r of rows.value) {
    const cur = map.get(r.region) ?? { bytes: 0, users: 0, provinces: 0 }
    cur.bytes += r.trafficBytes
    cur.users += r.users
    cur.provinces += 1
    map.set(r.region, cur)
  }
  const total = [...map.values()].reduce((s, v) => s + v.bytes, 0)
  return [...map.entries()]
    .map(([region, v]) => ({ region, ...v, share: (v.bytes / total) * 100 }))
    .sort((a, b) => b.bytes - a.bytes)
})

const filtered = computed(() => {
  const k = q.value.trim()
  let list = rows.value
  if (regionFilter.value !== '全部') list = list.filter((r) => r.region === regionFilter.value)
  if (k) list = list.filter((r) => r.province.includes(k) || r.region.includes(k))
  return [...list].sort((a, b) => {
    const av = sortKey.value === 'traffic' ? a.trafficBytes : a[sortKey.value]
    const bv = sortKey.value === 'traffic' ? b.trafficBytes : b[sortKey.value]
    return (av - bv) * sortDir.value
  })
})

function setSort(k: typeof sortKey.value) {
  if (sortKey.value === k) sortDir.value *= -1
  else {
    sortKey.value = k
    sortDir.value = -1
  }
}

const mapOption = computed(() => {
  if (!mapReady.value) return {}
  const values = rows.value.map((r) => ({ name: r.province, value: metricValue(r), selected: selected.value === r.province }))
  const nums = values.map((v) => v.value)
  return {
    animationDuration: 500,
    tooltip: {
      ...tooltipBase,
      formatter: (p: any) => {
        const r = rows.value.find((x) => x.province === p.name)
        if (!r) return `${p.name}<br/><span style="opacity:.6">暂无数据</span>`
        return `<div style="font-weight:600;margin-bottom:4px">${r.province} · ${r.region}</div>
          <div>流量 <b>${fmtBytes(r.trafficBytes, 0)}</b>（占 ${r.share.toFixed(1)}%）</div>
          <div>用户 ${fmtCount(r.users)} · 人均 ${fmtBytes(r.perUserBytes, 0)}</div>
          <div>同比 <b style="color:${r.growth >= 0 ? '#6ee7b7' : '#fca5a5'}">${r.growth > 0 ? '+' : ''}${r.growth.toFixed(1)}%</b></div>`
      }
    },
    visualMap: {
      show: false,
      seriesIndex: 0,
      min: Math.min(...nums),
      max: Math.max(...nums),
      inRange: { color: ['#eef3ff', '#c6d7ff', '#8badff', '#4b7dff', '#1f5eff'] }
    },
    series: [
      {
        type: 'map',
        map: 'china',
        roam: true,
        zoom: 1.38,
        scaleLimit: { min: 0.9, max: 4 },
        selectedMode: 'single',
        label: { show: false },
        itemStyle: { areaColor: '#edf2fb', borderColor: '#ffffff', borderWidth: 1 },
        emphasis: {
          label: { show: true, color: '#0c1526', fontSize: 10, fontWeight: 500 },
          itemStyle: { areaColor: '#c9d9ff' }
        },
        select: {
          label: { show: true, color: '#fff', fontSize: 10, fontWeight: 500 },
          itemStyle: { areaColor: '#1f5eff' }
        },
        data: values
      }
    ]
  } as any
})

const legendExtent = computed(() => {
  const nums = rows.value.map((r) => metricValue(r))
  if (!nums.length) return { min: '0', max: '0' }
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const f = (v: number) => {
    if (metric.value === 'traffic' || metric.value === 'perUser') return fmtBytes(v, 0)
    if (metric.value === 'users') return fmtCount(v)
    return `${v.toFixed(1)}%`
  }
  return { min: f(min), max: f(max) }
})

const regionBarOption = computed(() => {
  const list = [...regionAgg.value].reverse()
  return {
    animationDuration: 400,
    grid: { left: 8, right: 44, top: 4, bottom: 0, containLabel: true },
    tooltip: { ...tooltipBase, formatter: (p: any) => `${p.name}<br/>${fmtBytes(p.value, 0)} · ${regionAgg.value.find((r) => r.region === p.name)?.share.toFixed(1)}%` },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: list.map((r) => r.region),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...axisLabel, fontSize: 11 }
    },
    series: [
      {
        type: 'bar',
        data: list.map((r) => r.bytes),
        barWidth: 9,
        itemStyle: {
          borderRadius: [0, 5, 5, 0],
          color: (p: any) => chartPalette[p.dataIndex % chartPalette.length]
        },
        label: {
          show: true,
          position: 'right',
          formatter: (p: any) => `${regionAgg.value.find((r) => r.region === list[p.dataIndex].region)?.share.toFixed(1)}%`,
          color: C.text2,
          fontSize: 10
        }
      }
    ]
  } as any
})

function selectProvince(name: string) {
  selected.value = selected.value === name ? null : name
}

function onMapClick(p: any) {
  if (p?.name) selectProvince(p.name)
}

function viewCells() {
  if (!selectedRow.value) return
  ui.region = selectedRow.value.region
  router.push('/cells')
}

function exportCsv() {
  const header = ['排名', '省份', '大区', '流量(字节)', '用户数', '人均流量(字节)', '同比%', '小区数']
  const list = [...rows.value].sort((a, b) => b.trafficBytes - a.trafficBytes)
  const body = list.map((r, i) => [i + 1, r.province, r.region, r.trafficBytes, r.users, r.perUserBytes, r.growth, r.cells])
  downloadFile(`区域分布_${ui.range}.csv`, toCsv([header, ...body]))
  toast('success', '已导出 CSV', `${body.length} 个省级行政区`)
}

onMounted(async () => {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}geo/china.json`)
    const geo = await res.json()
    geo.features = (geo.features || []).filter((f: any) => f?.properties?.name)
    for (const f of geo.features) {
      const g = f.geometry
      if (!g) continue
      if (g.type === 'Polygon') {
        g.coordinates = g.coordinates.filter((ring: any[]) => Math.max(...ring.map((p: number[]) => p[1])) >= 15)
      } else if (g.type === 'MultiPolygon') {
        g.coordinates = g.coordinates.filter((poly: any[]) => Math.max(...poly[0].map((p: number[]) => p[1])) >= 15)
      }
    }
    geo.features = geo.features.filter((f: any) => f.geometry?.coordinates?.length)
    echarts.registerMap('china', geo)
    mapReady.value = true
  } catch (e) {
    mapError.value = `地图数据加载失败：${(e as Error).message}`
  }
  window.addEventListener('telco:export', exportCsv)
})

onUnmounted(() => window.removeEventListener('telco:export', exportCsv))
</script>

<template>
  <div v-if="error" class="card error-card">
    <Icon name="alert" :size="22" />
    <div><strong>区域数据加载失败</strong><p>{{ error }}</p></div>
    <button class="btn btn--primary" @click="run">重试</button>
  </div>

  <div v-else-if="data" class="page">
    <section class="stats">
      <div class="stat">
        <span class="stat-label">覆盖省级行政区</span>
        <strong class="num">{{ rows.length }}</strong>
        <span class="stat-sub">7 个大区 · {{ rows.reduce((s, r) => s + r.cells, 0) }} 个重点小区</span>
      </div>
      <div class="stat">
        <span class="stat-label">流量最高</span>
        <strong>{{ topByTraffic?.province }}</strong>
        <span class="stat-sub">{{ fmtBytes(topByTraffic?.trafficBytes ?? 0, 0) }} · 占 {{ topByTraffic?.share.toFixed(1) }}%</span>
      </div>
      <div class="stat">
        <span class="stat-label">增长最快</span>
        <strong>{{ topByGrowth?.province }}</strong>
        <span class="stat-sub"><span class="delta delta--up">{{ fmtDelta(topByGrowth?.growth ?? 0) }}</span> · 较上期</span>
      </div>
      <div class="stat">
        <span class="stat-label">人均流量最高</span>
        <strong>{{ topByPerUser?.province }}</strong>
        <span class="stat-sub">{{ fmtBytes(topByPerUser?.perUserBytes ?? 0, 0) }} / 人</span>
      </div>
    </section>

    <div class="grid grid--map">
      <Panel title="全国流量地图" :sub="`${metricLabel[metric]} · ${ui.range === 'today' ? '今日' : ui.range === '7d' ? '近 7 天' : '近 30 天'} · 滚轮缩放 / 点击省份下钻`">
        <template #actions>
          <div class="seg seg--sm">
            <button class="seg__item" :class="{ 'is-active': metric === 'traffic' }" @click="metric = 'traffic'">流量</button>
            <button class="seg__item" :class="{ 'is-active': metric === 'users' }" @click="metric = 'users'">用户</button>
            <button class="seg__item" :class="{ 'is-active': metric === 'perUser' }" @click="metric = 'perUser'">人均</button>
            <button class="seg__item" :class="{ 'is-active': metric === 'growth' }" @click="metric = 'growth'">增速</button>
          </div>
        </template>
        <div v-if="mapError" class="map-error">{{ mapError }}</div>
        <BaseChart v-else :option="mapOption" height="480px" :replace-merge="['series', 'visualMap']" @chart-click="onMapClick" />
        <div class="map-foot">
          <span class="crumb-line">
            <button class="crumb-btn" @click="selected = null">全国</button>
            <template v-if="selectedRow">
              <Icon name="chevron-right" :size="12" />
              <span>{{ selectedRow.region }}</span>
              <Icon name="chevron-right" :size="12" />
              <b>{{ selectedRow.province }}</b>
            </template>
          </span>
          <span class="map-legend">
            <span class="legend-edge">{{ legendExtent.min }}</span>
            <i class="legend-bar" />
            <span class="legend-edge">{{ legendExtent.max }}</span>
          </span>
        </div>
      </Panel>

      <Panel v-if="selectedRow" :title="selectedRow.province" :sub="`${selectedRow.region} · 流量排名第 ${selectedRank}`">
        <template #actions>
          <button class="btn btn--sm" @click="selected = null"><Icon name="close" :size="12" />清除</button>
        </template>
        <div class="detail-hero">
          <div>
            <span class="detail-label">流量</span>
            <strong class="num">{{ fmtBytes(selectedRow.trafficBytes, 0) }}</strong>
          </div>
          <span class="chip chip--blue">占全网 {{ selectedRow.share.toFixed(1) }}%</span>
        </div>
        <div class="detail-grid">
          <div><span>活跃用户</span><strong class="num">{{ fmtCount(selectedRow.users) }}</strong></div>
          <div><span>人均流量</span><strong class="num">{{ fmtBytes(selectedRow.perUserBytes, 0) }}</strong></div>
          <div><span>同比增速</span><strong class="num" :class="selectedRow.growth >= 0 ? 'up' : 'down'">{{ fmtDelta(selectedRow.growth) }}</strong></div>
          <div><span>重点小区</span><strong class="num">{{ fmtInt(selectedRow.cells) }} 个</strong></div>
        </div>
        <div class="detail-section">
          <h4>同区域省份对比</h4>
          <ul class="peer-list">
            <li
              v-for="p in rows.filter((r) => r.region === selectedRow?.region).sort((a, b) => b.trafficBytes - a.trafficBytes).slice(0, 5)"
              :key="p.province"
              :class="{ 'is-active': p.province === selectedRow?.province }"
              @click="selectProvince(p.province)"
            >
              <span class="peer-name">{{ p.province }}</span>
              <span class="peer-bar"><i :style="{ width: `${(p.trafficBytes / (topByTraffic?.trafficBytes || 1)) * 100}%` }" /></span>
              <span class="peer-val num">{{ fmtBytes(p.trafficBytes, 0) }}</span>
            </li>
          </ul>
        </div>
        <button class="btn btn--soft detail-action" @click="viewCells">
          查看该省重点小区
          <Icon name="chevron-right" :size="13" />
        </button>
      </Panel>

      <Panel v-else title="大区流量结构" sub="点击地图省份可比对同区域">
        <BaseChart :option="regionBarOption" height="300px" />
        <p class="region-note">
          华东 7 省贡献 {{ regionAgg[0]?.share.toFixed(1) }}% 的流量，是资源投入的重点区域；东北仅
          {{ regionAgg[regionAgg.length - 1]?.share.toFixed(1) }}%，网络利用率相对宽裕。地图颜色对应「{{ metricLabel[metric] }}」维度，可切换流量、用户、人均与增速。
        </p>
      </Panel>
    </div>

    <Panel title="省级明细" :sub="`${filtered.length} 条 · 点击表头排序`" flush>
      <template #actions>
        <div class="filters">
          <div class="search">
            <Icon name="search" :size="14" />
            <input v-model="q" class="input" placeholder="搜索省份或大区" aria-label="搜索省份" />
          </div>
          <select v-model="regionFilter" class="input select" aria-label="按大区筛选">
            <option>全部</option>
            <option v-for="r in ['华北', '东北', '华东', '华中', '华南', '西南', '西北']" :key="r">{{ r }}</option>
          </select>
        </div>
      </template>
      <div class="table-wrap table-scroll">
        <table class="table table--compact">
          <thead>
            <tr>
              <th class="w-40">#</th>
              <th>省份</th>
              <th>大区</th>
              <th class="num sortable" @click="setSort('traffic')">流量 <span class="sort">{{ sortKey === 'traffic' ? (sortDir < 0 ? '↓' : '↑') : '↕' }}</span></th>
              <th class="num sortable" @click="setSort('users')">用户 <span class="sort">{{ sortKey === 'users' ? (sortDir < 0 ? '↓' : '↑') : '↕' }}</span></th>
              <th class="num sortable" @click="setSort('perUser')">人均 <span class="sort">{{ sortKey === 'perUser' ? (sortDir < 0 ? '↓' : '↑') : '↕' }}</span></th>
              <th class="num sortable" @click="setSort('growth')">同比 <span class="sort">{{ sortKey === 'growth' ? (sortDir < 0 ? '↓' : '↑') : '↕' }}</span></th>
              <th class="num">小区</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in filtered" :key="r.province" class="row-click" :class="{ 'is-selected': selected === r.province }" @click="selectProvince(r.province)">
              <td class="muted">{{ i + 1 }}</td>
              <td class="is-strong">{{ r.province }}</td>
              <td>{{ r.region }}</td>
              <td class="num">{{ fmtBytes(r.trafficBytes, 0) }}</td>
              <td class="num">{{ fmtCount(r.users) }}</td>
              <td class="num">{{ fmtBytes(r.perUserBytes, 0) }}</td>
              <td class="num"><span :class="r.growth >= 0 ? 'up' : 'down'">{{ fmtDelta(r.growth) }}</span></td>
              <td class="num">{{ r.cells }}</td>
            </tr>
            <tr v-if="!filtered.length">
              <td colspan="8" class="empty-cell">没有匹配的省份</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>
  </div>

  <div v-else class="skeleton-page">
    <div class="skeleton stats-skel" />
    <div class="grid grid--map"><div class="skeleton map-skel" /><div class="skeleton map-skel" /></div>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 12px; }

.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.stat {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 15px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-shadow: var(--shadow-sm);
}

.stat-label { font-size: 11px; color: var(--text-3); }
.stat strong { font-size: 17px; font-weight: 600; letter-spacing: -0.02em; }
.stat-sub { font-size: 10.5px; color: var(--text-3); }

.grid { display: grid; gap: 12px; }
.grid--map { grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); }

.seg--sm .seg__item { height: 24px; padding: 0 8px; font-size: 11px; }

.map-error {
  height: 480px;
  display: grid;
  place-items: center;
  color: var(--red);
  font-size: 12px;
  background: var(--surface-2);
  border-radius: 8px;
}

.map-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 4px;
  font-size: 10.5px;
}

.map-legend {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
}

.legend-edge {
  font-size: 9.5px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.legend-bar {
  width: 74px;
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(90deg, #eef3ff, #c6d7ff, #8badff, #4b7dff, #1f5eff);
  display: block;
}

.crumb-line { display: inline-flex; align-items: center; gap: 4px; color: var(--text-3); }
.crumb-btn { color: var(--primary); font-size: 11px; }
.crumb-btn:hover { text-decoration: underline; }
.crumb-line b { color: var(--text); font-weight: 500; }

.detail-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.detail-label { display: block; font-size: 10.5px; color: var(--text-3); margin-bottom: 2px; }
.detail-hero strong { font-size: 25px; font-weight: 650; letter-spacing: -0.03em; }

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--border);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  margin: 12px 0;
}

.detail-grid > div { background: var(--surface); padding: 9px 11px; display: flex; flex-direction: column; gap: 2px; }
.detail-grid span { font-size: 10px; color: var(--text-3); }
.detail-grid strong { font-size: 12.5px; font-weight: 550; }
.up { color: var(--green); }
.down { color: var(--red); }

.detail-section h4 { font-size: 11px; color: var(--text-3); font-weight: 500; margin-bottom: 6px; }

.peer-list { display: flex; flex-direction: column; gap: 2px; }
.peer-list li {
  display: grid;
  grid-template-columns: 88px 1fr 64px;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-2);
}
.peer-list li:hover { background: var(--surface-2); }
.peer-list li.is-active { background: var(--primary-soft); color: var(--primary); }
.peer-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.peer-bar { height: 4px; background: var(--surface-3); border-radius: 999px; overflow: hidden; }
.peer-bar i { display: block; height: 100%; background: var(--primary); opacity: .65; border-radius: 999px; }
.peer-val { text-align: right; font-size: 10.5px; }

.detail-action { width: 100%; margin-top: 12px; justify-content: center; }

.region-list { display: flex; flex-direction: column; gap: 5px; margin-top: 8px; }
.region-row { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--text-2); }
.region-name { width: 30px; }
.region-meta { color: var(--text-3); font-size: 10px; flex: 1; }
.region-share { font-weight: 600; color: var(--text); }

.region-note {
  margin-top: 12px;
  padding: 10px 11px;
  border-radius: 8px;
  background: var(--surface-2);
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--text-3);
}

.filters { display: flex; gap: 8px; align-items: center; }
.search { position: relative; }
.search svg { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); color: var(--text-3); }
.search .input { width: 180px; height: 30px; padding-left: 28px; font-size: 12px; }
.select { height: 30px; width: 92px; font-size: 12px; }

.table-scroll { max-height: 392px; overflow: auto; }
th.sortable { cursor: pointer; user-select: none; }
th.sortable:hover { color: var(--text); }
.sort { color: var(--border-strong); font-size: 10px; }
.row-click { cursor: pointer; }
.row-click.is-selected td { background: var(--primary-soft); }
.w-40 { width: 40px; }
.empty-cell { text-align: center; color: var(--text-3); padding: 24px; }

.error-card { display: flex; align-items: center; gap: 14px; padding: 24px; color: var(--red); }
.error-card strong { color: var(--text); font-size: 13px; }
.error-card p { color: var(--text-3); font-size: 12px; margin-top: 2px; }
.error-card .btn { margin-left: auto; }

.skeleton-page { display: flex; flex-direction: column; gap: 12px; }
.stats-skel { height: 80px; }
.map-skel { height: 500px; }

@media (max-width: 1280px) {
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .grid--map { grid-template-columns: minmax(0, 1fr); }
}
</style>
