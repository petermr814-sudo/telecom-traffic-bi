<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import TrafficMap3D from './TrafficMap3D.vue'
import BaseChart from './BaseChart.vue'
import Icon from './Icon.vue'
import Panel from './Panel.vue'
import Select from './Select.vue'
import { api } from '@/api/client'
import type { ProvinceRow } from '@/api/types'
import { useAsync } from '@/lib/useAsync'
import { aggregateCities, cityMetric, type MapMetric } from '@/lib/cityTraffic'
import { fmtBytes, fmtCount, fmtDelta } from '@/lib/format'
import { axisLabel, tooltipBase } from '@/lib/chart'
import { ui } from '@/stores/ui'

const props = defineProps<{ provinces: ProvinceRow[] }>()
const metric = ref<MapMetric>('traffic')
const selected = ref<string | null>(null)
const query = ref('')
const moving = ref(false)
const metrics: { key: MapMetric; label: string }[] = [{ key: 'traffic', label: '流量' }, { key: 'users', label: '用户' }, { key: 'perUser', label: '人均' }, { key: 'growth', label: '增速' }]
const metricsGroup = ref<HTMLElement | null>(null)

// 指标切换的滑动胶囊遮罩：二次缓动补间，与时段页日期遮罩同一套缓动；
// 不跟随系统的「减少动画」偏好，保证切换时能明确看到滑动
const metricsMask = reactive({ left: 0, width: 0 })
let metricsRaf = 0
let metricsInited = false
const quadEaseInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2)

function metricsMaskTarget() {
  // 用静态 data-key 定位按钮：不能读 button.active，watcher 在类名更新前
  // 就会触发（flush 'pre'），那样目标还是旧按钮，胶囊会停在原地
  const el = metricsGroup.value?.querySelector<HTMLElement>(`[data-key="${metric.value}"]`)
  if (!metricsGroup.value || !el) return null
  return { left: el.offsetLeft, width: el.offsetWidth }
}

function moveMetricsMask() {
  const target = metricsMaskTarget()
  if (!target) return
  cancelAnimationFrame(metricsRaf)
  if (!metricsInited) {
    metricsMask.left = target.left
    metricsMask.width = target.width
    metricsInited = true
    return
  }
  const from = { left: metricsMask.left, width: metricsMask.width }
  const start = performance.now()
  const step = (now: number) => {
    const p = Math.min(1, (now - start) / 300)
    const eased = quadEaseInOut(p)
    metricsMask.left = from.left + (target.left - from.left) * eased
    metricsMask.width = from.width + (target.width - from.width) * eased
    if (p < 1) metricsRaf = requestAnimationFrame(step)
  }
  metricsRaf = requestAnimationFrame(step)
}
watch(metric, moveMetricsMask)
onMounted(() => {
  moveMetricsMask()
  window.addEventListener('resize', moveMetricsMask)
})
onUnmounted(() => {
  cancelAnimationFrame(metricsRaf)
  window.removeEventListener('resize', moveMetricsMask)
})
const rangeLabel = computed(() => ui.range === 'today' ? '今日' : ui.range === '7d' ? '近 7 天' : '近 30 天')
const { data, error, loading, run } = useAsync(() => api.cells(ui.range, 'all', ui.settings.warn, ui.settings.congest), () => [ui.range, ui.tick, ui.settings.warn, ui.settings.congest])
const { data: meta } = useAsync(() => api.meta())
const allCities = computed(() => aggregateCities(data.value?.rows ?? []))
const cities = computed(() => allCities.value.filter(c => ui.region === 'all' || c.region === ui.region))
const selectedCity = computed(() => cities.value.find(c => c.name === selected.value) ?? null)
const ranked = computed(() => [...cities.value].sort((a, b) => cityMetric(b, metric.value, props.provinces) - cityMetric(a, metric.value, props.provinces)))
const cityOptions = computed(() => ranked.value.map((c) => ({ value: c.name, label: `${c.name} · ${c.province}` })))
const filtered = computed(() => ranked.value.filter(c => `${c.name}${c.province}${c.region}`.includes(query.value.trim())))
const activeCells = computed(() => selectedCity.value?.cells ?? cities.value.flatMap(c => c.cells))
const totalTraffic = computed(() => activeCells.value.reduce((sum, c) => sum + c.traffic, 0))
const rankingMax = computed(() => Math.max(...ranked.value.map(c => Math.abs(cityMetric(c, metric.value, props.provinces))), 1))
const dailyLabels = computed(() => Array.from({ length: 7 }, (_, i) => meta.value?.dateEnd ? dayjs(meta.value.dateEnd).subtract(6 - i, 'day').format('MM-DD') : `第 ${i + 1} 天`))
const caption = computed(() => `真实 DEM 地形 · 石膏白模 · 高程夸张 ×${selected.value ? 6 : 24} · 城市标记：${metric.value === 'growth' ? '所在省同比' : metrics.find(m => m.key === metric.value)?.label}`)

function valueText(city: typeof cities.value[number]) {
  const value = cityMetric(city, metric.value, props.provinces)
  return metric.value === 'users' ? fmtCount(value) : metric.value === 'growth' ? fmtDelta(value) : fmtBytes(value, 1)
}
function selectCity(name: string) { selected.value = name }
function reset() { selected.value = null }
watch(cities, value => { if (selected.value && !value.some(c => c.name === selected.value)) reset() })

const trendOption = computed(() => {
  const city = selectedCity.value
  return {
    animationDuration: 250,
    grid: { left: 8, right: 16, top: 20, bottom: 6, containLabel: true },
    tooltip: { ...tooltipBase, trigger: 'axis', valueFormatter: (v: any) => `${Number(v).toFixed(1)}%` },
    xAxis: { type: 'category', data: dailyLabels.value, boundaryGap: false, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { ...axisLabel, color: '#9aa791', fontSize: 10 } },
    yAxis: { type: 'value', min: 0, max: 100, splitNumber: 4, axisLabel: { ...axisLabel, color: '#9aa791', fontSize: 10, formatter: '{value}%' }, splitLine: { lineStyle: { color: '#e9ede3' } } },
    series: [{ name: '带宽加权利用率', type: 'line', smooth: 0.35, symbol: 'circle', symbolSize: 5, data: city?.trend.map(v => +v.toFixed(1)) ?? [], lineStyle: { color: '#2e7a6f', width: 2.5 }, itemStyle: { color: '#2e7a6f', borderWidth: 2, borderColor: '#fff' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(46,122,111,.16)' }, { offset: 1, color: 'rgba(46,122,111,0)' }] } }, markLine: { silent: true, symbol: 'none', lineStyle: { color: '#d59e59', type: 'dashed', width: 1.25 }, label: { show: true, position: 'end', distance: 8, formatter: `预警 ${ui.settings.warn}%`, color: '#a9772f', fontSize: 9, backgroundColor: '#fbf3e2', borderRadius: 5, padding: [2, 5] }, data: [{ yAxis: ui.settings.warn }] } }]
  } as any
})
const networkOption = computed(() => ({
  animationDuration: 250,
  tooltip: { ...tooltipBase, formatter: (p: any) => `${p.name}<br/>${fmtBytes(p.value, 1)} · ${p.percent}%` },
  series: [{ type: 'pie', radius: ['58%', '80%'], center: ['50%', '48%'], label: { show: false }, itemStyle: { borderWidth: 2, borderColor: '#fff', borderRadius: 6 }, data: ['5G', '4G'].map((name, i) => ({ name, value: selectedCity.value?.cells.filter(c => c.generation === name).reduce((s, c) => s + c.traffic, 0) ?? 0, itemStyle: { color: i ? '#d5e1d8' : '#2e7a6f' } })) }]
}) as any)
const cellOption = computed(() => ({
  animationDuration: 250,
  grid: { left: 5, right: 58, top: 6, bottom: 4, containLabel: true },
  tooltip: { ...tooltipBase, formatter: (p: any) => `${selectedCity.value?.cells[p.dataIndex]?.name ?? ''}<br/>${fmtBytes(p.value, 1)} · 点击查看小区` },
  xAxis: { type: 'value', show: false },
  yAxis: { type: 'category', inverse: true, data: selectedCity.value?.cells.slice(0, 5).map(c => c.name.replace(selectedCity.value!.name, '')) ?? [], axisTick: { show: false }, axisLine: { show: false }, axisLabel: { ...axisLabel, width: 108, overflow: 'truncate', color: '#7f8f7e', fontSize: 10, formatter: (v: string, i: number) => `${String(i + 1).padStart(2, '0')} ${v}` } },
  series: [{ type: 'bar', barWidth: 9, showBackground: true, backgroundStyle: { color: '#eef1ea', borderRadius: 5 }, itemStyle: { color: '#2e7a6f', borderRadius: [0, 5, 5, 0] }, emphasis: { itemStyle: { color: '#27685f' } }, label: { show: true, position: 'right', color: '#5d7168', fontSize: 10, formatter: (p: any) => fmtBytes(p.value, 0) }, data: selectedCity.value?.cells.slice(0, 5).map(c => c.traffic) ?? [] }]
}) as any)
const regionRows = computed(() => {
  const regions = new Map<string, number>()
  for (const p of props.provinces) regions.set(p.region, (regions.get(p.region) ?? 0) + p.trafficBytes)
  const total = [...regions.values()].reduce((s, n) => s + n, 0)
  return [...regions].map(([name, bytes]) => ({ name, bytes, share: total ? bytes / total * 100 : 0 })).sort((a, b) => b.bytes - a.bytes)
})
</script>

<template>
  <section class="traffic-explorer" aria-label="全国流量地图与城市分析">
    <div class="atlas">
      <header class="atlas-header">
        <div class="atlas-title"><span class="atlas-icon"><Icon name="layers" :size="21" /></span><div><div class="eyebrow">TERRAIN ATLAS <span>/ 01</span></div><h2>全国流量地图</h2></div><span class="atlas-badge">地理白模</span></div>
        <div ref="metricsGroup" class="map-metrics" role="group" aria-label="地图指标"><span class="metrics-mask" aria-hidden="true" :style="{ left: `${metricsMask.left}px`, width: `${metricsMask.width}px` }" /><button v-for="m in metrics" :key="m.key" :data-key="m.key" :class="{ active: metric === m.key }" :aria-pressed="metric === m.key" @click="metric = m.key">{{ m.label }}</button></div>
      </header>
      <div v-if="error && data" class="refresh-error" role="alert">城市数据刷新失败，当前显示上次结果。<button @click="run">重试</button></div>
      <div class="atlas-body">
        <div class="map-column">
          <TrafficMap3D :cities="cities" :provinces="provinces" :metric="metric" :selected="selected" @select="selectCity" @reset="reset" @moving="moving = $event" />
          <div class="map-scale"><span>{{ caption }}</span><span class="scale-key">DEM 地形</span></div>
        </div>
        <aside class="city-panel" aria-label="城市数据">
          <template v-if="selectedCity">
            <button class="back-button" @click="reset"><Icon name="chevron-left" :size="13" />返回全国概览</button>
            <div class="city-heading"><div><p>{{ selectedCity.region }} · {{ selectedCity.province }}</p><h3>{{ selectedCity.name }}<span>城市洞察</span></h3></div><span class="city-target"><Icon name="target" :size="22" /></span></div>
            <div class="city-total"><span>{{ rangeLabel }}重点小区流量</span><strong class="num">{{ fmtBytes(selectedCity.traffic, 1) }}</strong><p>覆盖 {{ selectedCity.cells.length }} 个重点小区</p></div>
            <div class="city-kpis">
              <div><span>小区用户数合计</span><strong>{{ fmtCount(selectedCity.users) }}</strong></div><div><span>平均利用率</span><strong>{{ selectedCity.utilization.toFixed(1) }}<small>%</small></strong></div>
              <div><span>5G 流量占比</span><strong>{{ selectedCity.fiveGShare.toFixed(1) }}<small>%</small></strong></div><div><span>拥塞 / 预警小区</span><strong :class="{ amber: selectedCity.congested + selectedCity.warning > 0 }">{{ selectedCity.congested }}<small> / {{ selectedCity.warning }}</small></strong></div>
            </div>
            <div class="city-load"><div><span>网络负载</span><span>{{ selectedCity.utilization >= ui.settings.congest ? '拥塞' : selectedCity.utilization >= ui.settings.warn ? '预警' : '正常' }}</span></div><div class="load-track"><i :style="{ width: `${Math.min(100, selectedCity.utilization)}%`, background: selectedCity.utilization >= ui.settings.warn ? '#d0a061' : '#68c6c4' }" /></div><p>按小区带宽加权 · 预警线 {{ ui.settings.warn }}%</p></div>
            <div class="city-switch"><span class="city-switch__label">切换城市</span><Select class="city-switch__sel" :model-value="selected" :options="cityOptions" aria-label="切换城市" @update:model-value="selectCity(String($event))" /></div>
            <p class="panel-footnote"><Icon name="info" :size="12" />下方图表随城市与时间范围联动</p>
          </template>
          <template v-else>
            <div class="overview-heading"><div><div class="eyebrow">CITY EXPLORER</div><h3>从全国，深入一座城</h3></div><span>{{ cities.length }}<small> 城市</small></span></div>
            <p class="overview-desc">选择城市，让数据与空间一起聚焦。</p>
            <div class="city-search"><Icon name="search" :size="15" /><input v-model="query" aria-label="搜索地图城市" placeholder="搜索城市、省份或大区" /><button v-if="query" aria-label="清空城市搜索" @click="query = ''"><Icon name="close" :size="13" /></button></div>
            <div class="ranking-caption"><span>{{ query ? `找到 ${filtered.length} 座城市` : '重点城市排名' }}</span><span>{{ metric === 'growth' ? '所在省同比' : `${rangeLabel}${metrics.find(m => m.key === metric)?.label}` }}</span></div>
            <div v-if="error" class="city-empty" role="alert">城市数据加载失败<button @click="run">重新加载</button></div>
            <div v-else-if="loading && !data" class="city-empty" role="status">正在读取城市数据…</div>
            <div v-else class="city-ranking">
              <button v-for="(city, i) in filtered" :key="city.name" class="city-row" :data-city="city.name" :aria-label="`查看${city.name}城市详情`" @click="selectCity(city.name)"><span class="rank-no">{{ String(i + 1).padStart(2, '0') }}</span><span class="rank-city">{{ city.name }}<i :style="{ width: `${Math.max(3, Math.abs(cityMetric(city, metric, provinces)) / rankingMax * 100)}%` }" /></span><span class="rank-value num">{{ valueText(city) }}</span><Icon name="chevron-right" :size="12" /></button>
              <p v-if="!filtered.length" class="city-empty">暂无匹配城市，试试其他名称。</p>
            </div>
            <p class="panel-footnote"><span class="small-dot" />{{ activeCells.length }} 个重点小区 · {{ fmtBytes(totalTraffic, 1) }}<span v-if="api.mode !== 'api'"> · 模拟数据</span></p>
          </template>
        </aside>
      </div>
    </div>
    <div class="atlas-breadcrumb" aria-live="polite"><div><button @click="reset"><Icon name="globe" :size="13" />全国</button><template v-if="selectedCity"><Icon name="chevron-right" :size="12" /><span>{{ selectedCity.province }}</span><Icon name="chevron-right" :size="12" /><strong>{{ selectedCity.name }}</strong></template></div><span>{{ selectedCity ? (moving ? '镜头定位中' : '城市视角已就绪') : '地形由真实高程驱动 · 业务数据独立展示' }}</span></div>

    <div v-if="selectedCity" class="city-analysis" :data-city="selectedCity.name">
      <div class="analysis-heading"><div><span class="eyebrow">CITY DEEP DIVE</span><h3>{{ selectedCity.name }} · 网络运行画像</h3></div><span>{{ rangeLabel }} · {{ selectedCity.cells.length }} 个重点小区</span></div>
      <div class="analysis-charts">
        <Panel title="近 7 日负载趋势" sub="截至数据最新日期 · 按带宽加权的忙时利用率"><template #icon><span class="spec-no">01</span></template><template #actions><span class="chart-note"><i />预警 {{ ui.settings.warn }}%</span></template><BaseChart :option="trendOption" height="210px" :replace-merge="['series']" /></Panel>
        <Panel title="网络流量结构" :sub="`${rangeLabel} · 按 4G / 5G 分类`"><template #icon><span class="spec-no">02</span></template><div class="donut-wrap"><BaseChart :option="networkOption" height="174px" :replace-merge="['series']" /><div class="donut-center"><strong>{{ selectedCity.fiveGShare.toFixed(1) }}<small>%</small></strong><span>5G 流量</span></div></div><div class="network-legend"><span><i />5G<b class="num">{{ selectedCity.fiveGShare.toFixed(1) }}%</b></span><span><i />4G<b class="num">{{ (100 - selectedCity.fiveGShare).toFixed(1) }}%</b></span></div></Panel>
        <Panel title="重点小区 TOP 5" :sub="`${rangeLabel}流量 · 点击条形查看详情`"><template #icon><span class="spec-no">03</span></template><BaseChart :option="cellOption" height="210px" :replace-merge="['series']" @chart-click="p => { if (selectedCity?.cells[p.dataIndex]) ui.cellDetail = selectedCity.cells[p.dataIndex] }" /></Panel>
      </div>
      <p class="data-note"><Icon name="info" :size="13" />城市数据汇总自已覆盖的重点小区；用户数为小区用户数合计，未经跨小区去重。近 7 日趋势固定使用数据集最新 7 天，不受累计时间范围影响。</p>
    </div>
    <div v-else class="national-insight"><div class="insight-title"><Icon name="activity" :size="16" /><div><strong>大区流量结构</strong><span>全省统计汇总</span></div></div><div class="region-shares"><div v-for="(region, i) in regionRows" :key="region.name"><span>{{ region.name }}<b class="num">{{ region.share.toFixed(1) }}%</b></span><i :style="{ width: `${region.share / (regionRows[0]?.share || 1) * 100}%`, opacity: 1 - i * 0.09 }" /></div></div></div>
  </section>
</template>

<style scoped>
.traffic-explorer { min-width: 0; }
.refresh-error { padding: 10px 24px; color: #efc58b; background: #493a26; font-size: 12px; }
.refresh-error button { text-decoration: underline; margin-left: 12px; }
.atlas { overflow: hidden; border-radius: 18px; background: #ffffff; box-shadow: 0 8px 30px #132b4310; color: #34453e; }
.atlas-header { display: flex; justify-content: space-between; align-items: center; padding: 22px 25px; gap: 18px; border-bottom: 1px solid #e2e7e2; background: #ffffff; }
.atlas-title { display: flex; align-items: center; gap: 13px; }
.atlas-icon { color: #72897c; width: 39px; height: 39px; border: 1px solid #d8e1d9; border-radius: 11px; display: grid; place-items: center; }
.eyebrow { color: #87958c; font-size: 9px; letter-spacing: .14em; font-weight: 500; }
.eyebrow span { color: #bbc4bd; margin-left: 6px; }
.atlas-title h2 { font-size: 17px; letter-spacing: .02em; font-weight: 550; margin-top: 4px; }
.atlas-badge { margin-left: 8px; font-size: 10px; color: #819087; border: 1px solid #dde4dd; border-radius: 5px; padding: 4px 7px; }
.map-metrics { position: relative; display: flex; padding: 4px; background: #f2f4ef; border: 1px solid #dfe5dd; border-radius: 8px; flex-shrink: 0; }
.metrics-mask { position: absolute; top: 4px; bottom: 4px; left: 0; width: 0; border-radius: 5px; background: #ffffff; border: 1px solid #e2e9df; box-shadow: 0 1px 4px #0002; will-change: left, width; pointer-events: none; z-index: 0; }
.map-metrics button { position: relative; z-index: 1; color: #78867b; font-size: 11px; padding: 6px 14px; border-radius: 5px; transition: color 150ms ease, transform 150ms ease; }
.map-metrics button.active { color: #3b5745; }
.map-metrics button:active { transform: scale(.97); }
.atlas-body { display: grid; grid-template-columns: minmax(0, 1fr) 304px; }
.map-column { min-width: 0; }
.map-scale { min-height: 43px; display: flex; justify-content: space-between; align-items: center; gap: 12px; color: #8a958a; padding: 10px 24px; font-size: 9px; border-top: 1px solid #e0e6dd; background: #f7f8f4; }
.scale-key { display: inline-flex; gap: 8px; align-items: center; white-space: nowrap; }
.scale-key i { width: 54px; height: 4px; border-radius: 3px; background: linear-gradient(90deg, #d4dcd2, #a5b5a0); }
.city-panel { border-left: 1px solid #e2e7df; background: #fafbf8; padding: 25px 23px 18px; display: flex; flex-direction: column; min-width: 0; height: 583px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #d1dacd transparent; }
.overview-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.overview-heading h3 { font-size: 15px; font-weight: 500; margin-top: 10px; white-space: nowrap; }
.overview-heading > span { color: #829080; font-size: 21px; font-weight: 400; }
.overview-heading small { font-size: 9px; }
.overview-desc { color: #8c978b; font-size: 10px; margin-top: 9px; }
.city-search { display: flex; align-items: center; color: #879983; gap: 8px; padding: 10px 11px; border: 1px solid #dde5d9; background: #ffffff; border-radius: 7px; margin-top: 22px; }
.city-search input { background: transparent; color: #42523f; border: 0; outline: 0; width: 100%; min-width: 0; font-size: 11px; }
.city-search:focus-within { border-color: #a7b6a0; }
.city-search input::placeholder { color: #9ba697; }
.ranking-caption { display: flex; justify-content: space-between; font-size: 9px; color: #85927e; margin: 23px 0 10px; }
.city-ranking { overflow-y: auto; flex: 1; scrollbar-width: thin; scrollbar-color: #d1dacd transparent; margin: 0 -8px; padding: 0 8px; }
.city-row { width: 100%; display: grid; grid-template-columns: 22px minmax(0, 1fr) 66px 12px; align-items: center; gap: 8px; padding: 12px 0; text-align: left; border-bottom: 1px solid #e8ede3; transition: background 150ms ease; }
.city-row:hover, .city-row:focus-visible { background: #edf2e8; outline-color: #a2b69a; }
.rank-no { color: #9ca991; font: 10px var(--mono); }
.city-row:nth-child(-n+3) .rank-no { color: #718c65; }
.rank-city { color: #4e5b45; font-size: 12px; min-width: 0; position: relative; padding-bottom: 8px; }
.rank-city i { position: absolute; height: 2px; left: 0; bottom: 0; border-radius: 4px; background: #a4b69a; max-width: 100%; }
.rank-value { font-size: 11px; color: #718265; text-align: right; }
.city-row > svg { color: #9aab90; }
.panel-footnote { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; margin-top: 18px; color: #93a389; font-size: 9px; }
.small-dot { width: 4px; height: 4px; border-radius: 50%; background: #94aa86; }
.back-button { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; color: #8b9c81; align-self: flex-start; padding: 2px 0 16px; }
.back-button:hover { color: #506c44; }
.city-heading { display: flex; align-items: center; justify-content: space-between; padding-top: 4px; }
.city-heading p { font-size: 10px; color: #96a38b; }
.city-heading h3 { font-size: 28px; font-weight: 500; margin-top: 5px; letter-spacing: -.04em; }
.city-heading h3 span { font-size: 9px; font-weight: 400; color: #93a388; margin-left: 10px; letter-spacing: 0; }
.city-target { color: #79966a; border: 1px solid #d4dfcc; border-radius: 50%; display: grid; place-items: center; width: 42px; height: 42px; }
.city-total { margin-top: 20px; border-bottom: 1px solid #e0e8d9; padding-bottom: 18px; }
.city-total > span { font-size: 10px; color: #8e9e81; }
.city-total strong { display: block; font-size: 32px; font-weight: 450; letter-spacing: -.04em; margin: 8px 0 6px; color: #34482b; }
.city-total p { font-size: 9px; color: #9aa78c; }
.city-kpis { display: grid; grid-template-columns: 1fr 1fr; row-gap: 20px; padding: 18px 0; }
.city-kpis > div { display: flex; flex-direction: column; gap: 8px; }
.city-kpis span { font-size: 9px; color: #92a383; }
.city-kpis strong { font-size: 19px; font-weight: 400; font-variant-numeric: tabular-nums; }
.city-kpis small { font-size: 12px; color: #8c9f7b; }
.city-kpis .amber { color: #b78950; }
.city-load { border-top: 1px solid #e0e8d9; padding-top: 17px; }
.city-load > div:first-child { display: flex; justify-content: space-between; color: #849775; font-size: 10px; }
.load-track { height: 4px; background: #e3eadc; border-radius: 3px; margin: 10px 0 8px; overflow: hidden; }
.load-track i { display: block; height: 100%; border-radius: 3px; }
.city-load p { font-size: 9px; color: #98a98a; }
.city-switch { margin-top: auto; display: flex; gap: 14px; align-items: center; padding-top: 18px; }
.city-switch__label { font-size: 10px; color: #97a987; white-space: nowrap; }
.city-switch__sel { width: 100%; min-width: 0; }
.city-switch :deep(.sel__trigger) { background: #f0f4e9; border: 1px solid #dce4d3; border-radius: 5px; color: #677d54; font-size: 10px; height: 27px; padding: 0 8px; }
.city-switch :deep(.sel__trigger:hover) { border-color: #c3d2b8; background: #e9efdd; }
.city-switch :deep(.sel__value) { color: #677d54; }
.city-switch :deep(.sel__value.is-placeholder) { color: #97a987; }
.city-switch :deep(.sel__caret) { color: #97a987; }
.city-switch :deep(.sel.is-open .sel__trigger) { border-color: #a7b6a0; box-shadow: none; }
.city-switch :deep(.sel.is-open .sel__caret) { color: #677d54; }
.atlas-breadcrumb { display: flex; justify-content: space-between; gap: 15px; margin: 13px 3px 0; color: var(--text-3); font-size: 10px; }
.atlas-breadcrumb > div, .atlas-breadcrumb button { display: flex; align-items: center; gap: 8px; }
.atlas-breadcrumb button { color: var(--primary); }
.atlas-breadcrumb strong { color: var(--text-2); font-weight: 500; }
.city-analysis { margin-top: 30px; }
.analysis-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.analysis-heading h3 { margin-top: 7px; font-size: 17px; font-weight: 550; }
.analysis-heading > span { font-size: 11px; color: var(--text-3); }
.analysis-charts { display: grid; grid-template-columns: 1.3fr .85fr 1.1fr; gap: 18px; }
.analysis-charts :deep(.panel) { border-color: #e2e9e0; border-radius: 14px; box-shadow: 0 6px 20px #233d3008; }
.analysis-charts :deep(.panel-head) { padding: 20px 20px 14px; border-bottom: 1px solid #eef2ea; }
.analysis-charts :deep(.panel-title) { font-size: 15px; letter-spacing: .01em; }
.analysis-charts :deep(.panel-body) { padding: 16px 14px 18px; }
.spec-no { font: 10px var(--mono); color: #93a08f; letter-spacing: .12em; }
.chart-note { display: flex; gap: 5px; align-items: center; font-size: 9px; color: var(--text-3); white-space: nowrap; }
.chart-note i { width: 12px; border-top: 1px dashed #d59e59; }
.donut-wrap { position: relative; }
.donut-center { position: absolute; top: 48%; left: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 5px; pointer-events: none; }
.donut-center strong { font-size: 27px; font-weight: 500; letter-spacing: -.03em; }
.donut-center small { font-size: 12px; margin-left: 2px; color: var(--text-3); }
.donut-center span { font-size: 10px; color: var(--text-3); }
.network-legend { display: flex; justify-content: center; gap: 25px; font-size: 10px; color: var(--text-2); padding-top: 10px; }
.network-legend span { display: inline-flex; align-items: center; gap: 7px; }
.network-legend i { width: 7px; height: 7px; border-radius: 2px; background: #2e7a6f; }
.network-legend span + span i { background: #d5e1d8; }
.network-legend b { font-weight: 500; color: #5d7168; margin-left: 2px; }
.data-note { display: flex; gap: 7px; color: var(--text-3); font-size: 10px; line-height: 1.8; margin: 13px 2px 0; }
.data-note > svg { flex-shrink: 0; margin-top: 3px; }
.national-insight { display: flex; gap: 30px; padding: 24px 28px; margin-top: 24px; background: white; border: 1px solid var(--border); border-radius: 14px; align-items: center; }
.insight-title { display: flex; gap: 12px; align-items: center; flex-shrink: 0; color: #4b8992; }
.insight-title strong { font-size: 12px; font-weight: 500; color: var(--text); }
.insight-title span { display: block; font-size: 9px; color: var(--text-3); margin-top: 5px; }
.region-shares { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 22px; flex: 1; min-width: 0; }
.region-shares > div > span { display: flex; justify-content: space-between; gap: 8px; font-size: 10px; color: var(--text-3); }
.region-shares b { font-size: 11px; font-weight: 500; color: var(--text-2); }
.region-shares i { display: block; height: 3px; margin-top: 11px; background: #509ba5; border-radius: 3px; }
.city-empty { color: #99a58f; font-size: 12px; line-height: 1.8; padding: 25px 0; }
.city-empty button { display: block; margin-top: 8px; color: #819775; text-decoration: underline; }
@media (max-width: 1380px) { .atlas-body { grid-template-columns: minmax(0, 1fr) 270px; } .city-panel { padding-left: 18px; padding-right: 18px; } .atlas-badge { display: none; } .region-shares { gap: 15px; } .national-insight { gap: 22px; padding: 22px; } .region-shares > div > span { flex-direction: column; gap: 5px; } .analysis-charts { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .analysis-charts > :first-child { grid-column: 1 / -1; } }
@media (max-width: 1000px) { .atlas-body { grid-template-columns: minmax(0, 1fr); } .city-panel { height: auto; min-height: 340px; border-left: 0; border-top: 1px solid #e2e7df; padding: 22px; } .city-ranking { max-height: 245px; } .city-heading { justify-content: flex-start; gap: 24px; } .city-total { margin-top: 18px; } .city-kpis { grid-template-columns: repeat(4, 1fr); } .city-switch { max-width: 350px; } .city-load { max-width: 100%; } .national-insight { flex-direction: column; align-items: stretch; gap: 22px; } .region-shares { flex: auto; } }
@media (max-width: 600px) { .atlas-header { padding: 18px; flex-wrap: wrap; gap: 18px; } .atlas-icon { width: 34px; height: 34px; } .atlas-title h2 { font-size: 15px; } .map-metrics { width: 100%; } .map-metrics button { flex: 1; } .atlas-breadcrumb { flex-direction: column; gap: 9px; } .map-scale { padding: 10px 16px; } .map-scale > span:first-child { max-width: 75%; line-height: 1.7; } .scale-key i { width: 32px; } .city-kpis { grid-template-columns: 1fr 1fr; } .analysis-charts { grid-template-columns: minmax(0, 1fr); } .analysis-heading { align-items: flex-start; flex-direction: column; } .analysis-heading h3 { font-size: 15px; } .region-shares { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px 16px; } .national-insight { padding: 20px; } }
@media (prefers-reduced-motion: reduce) { .map-metrics button, .city-row { transition: none; } }
</style>
