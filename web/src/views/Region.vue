<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Panel from '@/components/Panel.vue'
import TrafficExplorer from '@/components/TrafficExplorer.vue'
import Icon from '@/components/Icon.vue'
import Select from '@/components/Select.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import { useAsync } from '@/lib/useAsync'
import { api } from '@/api/client'
import type { ProvinceRow } from '@/api/types'
import { fmtBytes, fmtCount, fmtDelta, fmtInt } from '@/lib/format'
import { downloadFile, toCsv, toast, ui } from '@/stores/ui'

const router = useRouter()
const selected = ref<string | null>(null)
const q = ref('')
const regionFilter = ref<string>('全部')
const regionOptions = ['全部', '华北', '东北', '华东', '华中', '华南', '西南', '西北'].map((r) => ({ value: r, label: r }))
const sortKey = ref<'traffic' | 'users' | 'perUser' | 'growth'>('traffic')
const sortDir = ref(-1)

const { data, error, loading, run } = useAsync(
  () => api.provinces(ui.range),
  () => [ui.range, ui.tick]
)

const rows = computed<ProvinceRow[]>(() => data.value ?? [])

const selectedRow = computed(() => rows.value.find((r) => r.province === selected.value) ?? null)
const selectedRank = computed(() => {
  if (!selectedRow.value) return 0
  const sorted = [...rows.value].sort((a, b) => b.trafficBytes - a.trafficBytes)
  return sorted.findIndex((r) => r.province === selectedRow.value?.province) + 1
})

const topByTraffic = computed(() => [...rows.value].sort((a, b) => b.trafficBytes - a.trafficBytes)[0])
const topByGrowth = computed(() => [...rows.value].filter((r) => r.trafficBytes > 1e14).sort((a, b) => b.growth - a.growth)[0])
const topByPerUser = computed(() => [...rows.value].sort((a, b) => b.perUserBytes - a.perUserBytes)[0])

const filtered = computed(() => {
  const k = q.value.trim()
  let list = rows.value
  if (regionFilter.value !== '全部') list = list.filter((r) => r.region === regionFilter.value)
  if (k) list = list.filter((r) => r.province.includes(k) || r.region.includes(k))
  return [...list].sort((a, b) => {
    const av = sortKey.value === 'traffic' ? a.trafficBytes : sortKey.value === 'perUser' ? a.perUserBytes : a[sortKey.value]
    const bv = sortKey.value === 'traffic' ? b.trafficBytes : sortKey.value === 'perUser' ? b.perUserBytes : b[sortKey.value]
    return (av - bv) * sortDir.value
  })
})
const filteredMax = computed(() => Math.max(1, ...filtered.value.map((r) => r.trafficBytes)))

function setSort(k: typeof sortKey.value) {
  if (sortKey.value === k) sortDir.value *= -1
  else {
    sortKey.value = k
    sortDir.value = -1
  }
}

function selectProvince(name: string) {
  selected.value = selected.value === name ? null : name
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

onMounted(() => window.addEventListener('telco:export', exportCsv))

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
        <strong v-text-reveal class="num">{{ rows.length }}</strong>
        <span class="stat-sub">7 个大区 · {{ rows.reduce((s, r) => s + r.cells, 0) }} 个重点小区</span>
      </div>
      <div class="stat">
        <span class="stat-label">流量最高</span>
        <strong v-text-reveal>{{ topByTraffic?.province }}</strong>
        <span class="stat-sub">{{ fmtBytes(topByTraffic?.trafficBytes ?? 0, 0) }} · 占 {{ topByTraffic?.share.toFixed(1) }}%</span>
      </div>
      <div class="stat">
        <span class="stat-label">增长最快</span>
        <strong v-text-reveal>{{ topByGrowth?.province }}</strong>
        <span class="stat-sub"><span class="delta delta--up">{{ fmtDelta(topByGrowth?.growth ?? 0) }}</span> · 较上期</span>
      </div>
      <div class="stat">
        <span class="stat-label">人均流量最高</span>
        <strong v-text-reveal>{{ topByPerUser?.province }}</strong>
        <span class="stat-sub">{{ fmtBytes(topByPerUser?.perUserBytes ?? 0, 0) }} / 人</span>
      </div>
    </section>

    <TrafficExplorer :provinces="rows" />

      <Panel v-if="selectedRow" class="prov-detail-panel" :title="selectedRow.province" :sub="`${selectedRow.region} · 流量排名第 ${selectedRank}`">
        <template #actions>
          <button class="btn btn--sm" @click="selected = null"><Icon name="close" :size="12" />清除</button>
        </template>
        <div class="detail-hero">
          <div>
            <span class="detail-label">流量</span>
            <strong class="num">{{ fmtBytes(selectedRow.trafficBytes, 0) }}</strong>
          </div>
          <span class="prov-chip">占全网 {{ selectedRow.share.toFixed(1) }}%</span>
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


    <div class="section-heading prov-heading"><div class="prov-eyebrow">PROVINCE SURVEY <span>/ 04</span></div><h2>省份明细</h2><p>搜索、排序并比较各省表现</p></div>
    <Panel class="prov-table-panel" title="省级明细" :sub="`${filtered.length} 条 · 点击表头排序`" flush>
      <template #actions>
        <div class="filters">
          <div class="search">
            <Icon name="search" :size="14" />
            <input v-model="q" v-type-reveal class="input" placeholder="搜索省份或大区" aria-label="搜索省份" />
          </div>
          <Select v-model="regionFilter" class="select" size="sm" :options="regionOptions" aria-label="按大区筛选" />
        </div>
      </template>
      <div class="table-wrap table-scroll" v-swap-reveal>
        <table class="table table--compact">
          <thead>
            <tr>
              <th class="w-40">#</th>
              <th>省份</th>
              <th>大区</th>
              <th class="num sortable" :class="{ 'is-sorted': sortKey === 'traffic' }" @click="setSort('traffic')">流量 <span class="sort">{{ sortKey === 'traffic' ? (sortDir < 0 ? '↓' : '↑') : '↕' }}</span></th>
              <th class="num sortable" :class="{ 'is-sorted': sortKey === 'users' }" @click="setSort('users')">用户 <span class="sort">{{ sortKey === 'users' ? (sortDir < 0 ? '↓' : '↑') : '↕' }}</span></th>
              <th class="num sortable" :class="{ 'is-sorted': sortKey === 'perUser' }" @click="setSort('perUser')">人均 <span class="sort">{{ sortKey === 'perUser' ? (sortDir < 0 ? '↓' : '↑') : '↕' }}</span></th>
              <th class="num sortable" :class="{ 'is-sorted': sortKey === 'growth' }" @click="setSort('growth')">同比 <span class="sort">{{ sortKey === 'growth' ? (sortDir < 0 ? '↓' : '↑') : '↕' }}</span></th>
              <th class="num">小区</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in filtered" :key="r.province" class="row-click" :class="{ 'is-selected': selected === r.province }" @click="selectProvince(r.province)">
              <td class="rank-cell"><span class="rank-chip" :class="i < 3 ? `rank-${i + 1}` : ''">{{ i + 1 }}</span></td>
              <td class="prov-name">{{ r.province }}</td>
              <td><span class="region-tag">{{ r.region }}</span></td>
              <td class="num"><div class="traffic-cell"><span>{{ fmtBytes(r.trafficBytes, 0) }}</span><i class="traffic-bar" :style="{ width: `${(r.trafficBytes / filteredMax) * 96}px` }" /></div></td>
              <td class="num">{{ fmtCount(r.users) }}</td>
              <td class="num">{{ fmtBytes(r.perUserBytes, 0) }}</td>
              <td class="num"><span class="growth-chip" :class="r.growth >= 0 ? 'is-up' : 'is-down'"><Icon :name="r.growth >= 0 ? 'arrow-up' : 'arrow-down'" :size="10" />{{ fmtDelta(r.growth) }}</span></td>
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

  <Transition name="skeleton-fade" :duration="250">
    <div v-if="!error && !data" class="skeleton-page">
      <SkeletonLoader class="card stats-skel" variant="line" compact />
      <SkeletonLoader class="card map-skel" variant="chart" label="正在加载区域数据…" />
    </div>
  </Transition>
</template>

<style scoped>
.skeleton-fade-leave-active { transition: opacity .25s ease; }
.skeleton-fade-leave-to { opacity: 0; }
.page { display: flex; flex-direction: column; gap: 24px; }

.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 24px;
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

.grid { display: grid; gap: 24px; }
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
.select { width: 92px; }

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

.skeleton-page { display: flex; flex-direction: column; gap: 24px; }
.stats-skel { height: 80px; }
.map-skel { height: 500px; }

@media (max-width: 1120px) {
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .grid--map { grid-template-columns: minmax(0, 1fr); }
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

.stat strong { font-size: 26px; margin: 10px 0 7px; }
.stat-label { font-size: 12px; }
.region-note { font-size: 12px; line-height: 1.8; background: transparent; border-top: 1px solid var(--border); padding: 20px 0 0; }
.filters { flex-wrap: wrap; }

/* 省份明细：制图图集数据板 */
.prov-heading { flex-direction: column; align-items: flex-start; gap: 4px; margin-top: 18px; }
.prov-eyebrow { color: #87958c; font-size: 9px; letter-spacing: .14em; font-weight: 500; }
.prov-eyebrow span { color: #bbc4bd; margin-left: 6px; }
.prov-heading h2 { font-size: 17px; font-weight: 550; }
.prov-heading p { font-size: 11px; }

.prov-table-panel { border-color: #e2e9e0; border-radius: 14px; box-shadow: 0 6px 20px #233d3008; }
.prov-table-panel :deep(.panel-head) { padding: 20px 20px 14px; border-bottom: 1px solid #eef2ea; }
.prov-table-panel :deep(.panel-body) { padding: 0; }
.prov-table-panel :deep(.panel-title) { font-size: 15px; }
.prov-table-panel .table-scroll { max-height: 440px; }
.prov-table-panel table { border-collapse: separate; border-spacing: 0; }
.prov-table-panel thead th { position: sticky; top: 0; z-index: 2; background: #fafbf7; padding: 10px 12px; font-size: 10px; color: #87958c; font-weight: 500; letter-spacing: .05em; border-bottom: 1px solid #e9ede3; }
.prov-table-panel thead th.sortable:hover { color: #2e7a6f; }
.prov-table-panel th.is-sorted { color: #2e7a6f; }
.prov-table-panel .sort { color: #b7c2b4; font-size: 10px; }
.prov-table-panel th.is-sorted .sort { color: #2e7a6f; }
.prov-table-panel tbody td { padding: 10px 12px; font-size: 11.5px; color: #43504b; border-bottom: 1px solid #f0f3ec; }
.prov-table-panel tbody tr:last-child td { border-bottom: 0; }
.prov-table-panel .row-click:hover td { background: #f6f8f3; }
.prov-table-panel .row-click.is-selected td { background: #eef3ea; }
.prov-table-panel .row-click.is-selected .prov-name { color: #2e7a6f; }
.prov-table-panel .empty-cell { padding: 28px; color: #93a08f; }

.rank-cell { width: 40px; }
.rank-chip { display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 5px; font: 10px var(--mono); color: #93a08f; background: #f2f4ee; }
.rank-chip.rank-1 { color: #fff; background: #2e7a6f; }
.rank-chip.rank-2 { color: #fff; background: #5f988f; }
.rank-chip.rank-3 { color: #fff; background: #8db3ab; }

.prov-name { font-size: 12.5px; font-weight: 600; color: #2f3d38; }
.region-tag { display: inline-block; padding: 2px 7px; border: 1px solid #dfe7dd; border-radius: 999px; background: #f6f8f3; color: #7f9182; font-size: 9.5px; }

.traffic-cell { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.traffic-cell span { font-size: 11.5px; color: #3c4a44; }
.traffic-bar { display: block; height: 2px; max-width: 96px; border-radius: 2px; background: #2e7a6f; opacity: .5; }

.growth-chip { display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px; border-radius: 999px; font-size: 10.5px; }
.growth-chip.is-up { color: #2e7a6f; background: #e7f1ea; }
.growth-chip.is-down { color: #b05050; background: #f6ebea; }

.prov-detail-panel { border-color: #e2e9e0; border-radius: 14px; box-shadow: 0 6px 20px #233d3008; }
.prov-detail-panel .detail-hero { border-color: #e9ede3; }
.prov-detail-panel .detail-hero strong { color: #2f3d38; }
.prov-detail-panel .detail-grid { border-color: #e9ede3; background: #e9ede3; }
.prov-detail-panel .detail-grid span { color: #87958c; }
.prov-detail-panel .detail-grid strong { color: #2f3d38; }
.prov-chip { display: inline-flex; align-items: center; padding: 3px 10px; border: 1px solid #d3e3d8; border-radius: 999px; background: #e7f1ea; color: #2e7a6f; font-size: 10px; font-weight: 500; }
.prov-detail-panel .peer-list li:hover { background: #f4f7f0; }
.prov-detail-panel .peer-list li.is-active { background: #eef3ea; color: #2e7a6f; }
.prov-detail-panel .peer-bar { background: #eef1ea; }
.prov-detail-panel .peer-bar i { background: #2e7a6f; }
.prov-detail-panel .detail-action { background: #eef3ea; border-color: #d9e6da; color: #2e7a6f; }

</style>
