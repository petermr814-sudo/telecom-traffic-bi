<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Panel from '@/components/Panel.vue'
import BaseChart from '@/components/BaseChart.vue'
import Icon from '@/components/Icon.vue'
import TickMeter from '@/components/TickMeter.vue'
import { fmtBytes, fmtRate } from '@/lib/format'
import { toast, ui } from '@/stores/ui'

interface Msg {
  id: number
  time: string
  cell: string
  action: string
  bytes: number
  partition: number
}

interface Consumer {
  id: string
  host: string
}

const rt = ref<HTMLElement | null>(null)
const playing = ref(true)
const speed = ref(1)
const immersive = ref(false)
const clock = ref('')
const latest = ref(11.42)
const msgRate = ref(124.6)
const lag = ref(128)

const points = ref<{ t: string; v: number }[]>([])
const msgs = ref<Msg[]>([])
const consumers = ref<Consumer[]>([
  { id: 'worker-1', host: 'hadoop1001' },
  { id: 'worker-2', host: 'hadoop1002' },
  { id: 'worker-3', host: 'hadoop1003' }
])
const partitions = ref([
  { id: 0, owner: 'worker-1', rate: 42.8, lag: 36 },
  { id: 1, owner: 'worker-2', rate: 39.4, lag: 52 },
  { id: 2, owner: 'worker-3', rate: 42.4, lag: 40 }
])

const ACTIONS = ['视频', '游戏', '支付', '网页', '下载', '直播']
const CELLS = ['杭州西湖5G宏站', '深圳南山5G室分', '成都高新5G宏站', '北京朝阳4G宏站', '上海浦东5G宏站', '武汉光谷5G室分']
let msgId = 0
let timer: number | null = null

const capacity = 15

function now(offset = 0) {
  const d = new Date(Date.now() - offset * 1000)
  return d.toLocaleTimeString('zh-CN', { hour12: false })
}

function seed() {
  const arr: { t: string; v: number }[] = []
  let v = 10.8
  for (let i = 59; i >= 0; i--) {
    v = Math.min(14.2, Math.max(8.4, v + (Math.random() - 0.48) * 0.5))
    arr.push({ t: now(i), v: Number(v.toFixed(2)) })
  }
  points.value = arr
  latest.value = arr[arr.length - 1].v
  for (let i = 0; i < 7; i++) pushMsg(true)
}

function pushMsg(silent = false) {
  const m: Msg = {
    id: ++msgId,
    time: now(),
    cell: CELLS[Math.floor(Math.random() * CELLS.length)],
    action: ACTIONS[Math.floor(Math.random() * ACTIONS.length)],
    bytes: Math.round(1e6 + Math.random() * 8e7),
    partition: Math.floor(Math.random() * 3)
  }
  msgs.value.unshift(m)
  if (msgs.value.length > 8) msgs.value.pop()
  if (!silent) msgRate.value = Number((118 + Math.random() * 14).toFixed(1))
}

function tick() {
  clock.value = now()
  const last = points.value[points.value.length - 1]?.v ?? 10
  const next = Math.min(14.6, Math.max(8.2, last + (Math.random() - 0.48) * 1.15))
  points.value = [...points.value.slice(1), { t: now(), v: Number(next.toFixed(2)) }]
  latest.value = Number(next.toFixed(2))
  lag.value = Math.max(20, Math.round(90 + Math.random() * 90))
  if (partitions.value.length) {
    partitions.value = partitions.value.map((p) => ({
      ...p,
      rate: Number((p.rate + (Math.random() - 0.5) * 1.6).toFixed(1)),
      lag: Math.max(8, Math.round(p.lag + (Math.random() - 0.5) * 14))
    }))
  }
  pushMsg()
}

function startTimer() {
  stopTimer()
  timer = window.setInterval(tick, 2000 / speed.value)
}

function stopTimer() {
  if (timer) window.clearInterval(timer)
  timer = null
}

function togglePlay() {
  playing.value = !playing.value
  if (playing.value) {
    startTimer()
    toast('info', '实时流已恢复', '每 2 秒推送一批聚合指标')
  } else {
    stopTimer()
    toast('info', '实时流已暂停', '图表保持最后一帧')
  }
}

function setSpeed(s: number) {
  speed.value = s
  if (playing.value) startTimer()
}

function clearFeed() {
  msgs.value = []
  toast('info', '消息流已清空', '新消息会继续追加')
}

function simulateScale() {
  if (consumers.value.length === 3) {
    consumers.value = consumers.value.filter((c) => c.id !== 'worker-3')
    partitions.value = partitions.value.map((p) =>
      p.id === 2 ? { ...p, owner: 'worker-1', lag: p.lag + 12 } : p
    )
    toast('warn', 'worker-3 已退出', '分区 2 重新分配给 worker-1，消费组完成再均衡')
  } else {
    consumers.value = [...consumers.value, { id: 'worker-3', host: 'hadoop1003' }]
    partitions.value = partitions.value.map((p) => (p.id === 2 ? { ...p, owner: 'worker-3' } : p))
    toast('success', 'worker-3 已恢复', '分区 2 已归还，三个消费者各持一个分区')
  }
}

async function toggleImmersive() {
  if (!document.fullscreenElement) {
    await rt.value?.requestFullscreen()
    immersive.value = true
  } else {
    await document.exitFullscreen()
    immersive.value = false
  }
}

function onFsChange() {
  immersive.value = Boolean(document.fullscreenElement)
}

const partitionShare = (rate: number) => rate / Math.max(1, partitions.value.reduce((sum, item) => sum + item.rate, 0)) * 100

const chartOption = computed<import('echarts').EChartsOption>(() => ({
  animation: true,
  animationDuration: 0,
  animationDurationUpdate: 260,
  animationEasingUpdate: 'linear',
  grid: { left: 6, right: 88, top: 26, bottom: 0, containLabel: true },
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(7,13,25,0.95)',
    borderWidth: 1,
    borderColor: '#1b2b47',
    textStyle: { color: '#e9f1ff', fontSize: 11 },
    formatter: (params) => { const p = Array.isArray(params) ? params[0] : params; return `${p.name}<br/><b style="color:#bad6eb">${p.value} Gbps</b>` }
  },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: points.value.map((p) => p.t),
    axisLine: { lineStyle: { color: '#1b2b47' } },
    axisTick: { show: false },
    axisLabel: { color: '#8096b7', fontSize: 11, interval: 'auto', hideOverlap: true }
  },
  yAxis: {
    type: 'value',
    min: 0,
    max: 20,
    splitLine: { lineStyle: { color: '#16243c', type: [3, 3] } },
    axisLabel: { color: '#6d81a3', fontSize: 9.5, formatter: '{value}G' }
  },
  series: [
    {
      id: 'live-rate',
      type: 'line',
      showSymbol: false,
      smooth: 0.25,
      data: points.value.map((p) => p.v),
      lineStyle: { width: 2.2, color: '#bad6eb' },
      endLabel: { show: true, formatter: (p: any) => `${Number(p.value).toFixed(2)} G`, color: '#bad6eb', fontSize: 13, fontWeight: 700, distance: 10 },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(112,150,209,0.18)' },
            { offset: 1, color: 'rgba(112,150,209,0)' }
          ]
        }
      },
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: '#f87171', type: 'dashed', width: 1 },
        label: { formatter: '门限 15 Gbps', color: '#f87171', fontSize: 9, position: 'insideEndTop' },
        data: [{ yAxis: capacity }]
      }
    }
  ],
  media: [
    { query: { maxWidth: 360 }, option: { grid: { right: 12 }, series: [{ id: 'live-rate', endLabel: { show: false } }] } },
    { option: { grid: { right: 88 }, series: [{ id: 'live-rate', endLabel: { show: true } }] } },
  ]
}))

const alerts = [
  { level: '严重', text: '杭州西湖5G宏站 忙时利用率 96.2%', time: '2 分钟前' },
  { level: '警告', text: '分区 1 消费滞后超过 120 条', time: '4 分钟前' },
  { level: '提示', text: 'worker-2 心跳恢复，分区分配完成', time: '9 分钟前' }
]

onMounted(() => {
  seed()
  startTimer()
  clock.value = now()
  document.addEventListener('fullscreenchange', onFsChange)
})

onUnmounted(() => {
  stopTimer()
  document.removeEventListener('fullscreenchange', onFsChange)
})

const gbps = computed(() => latest.value.toFixed(2))
const totalMsg = computed(() => msgRate.value.toFixed(1))
</script>

<template>
  <div ref="rt" class="rt theme-dark" :class="{ 'is-immersive': immersive }">
    <header class="rt-head">
      <div class="rt-title">
        <span class="live"><span class="live-dot" />LIVE</span>
        <div>
          <h2>实时流量监控</h2>
          <p>每 2 秒更新 · {{ clock }}</p>
        </div>
      </div>
      <div class="rt-actions">
        <div class="seg">
          <button class="seg__item" :class="{ 'is-active': speed === 1 }" @click="setSpeed(1)">1×</button>
          <button class="seg__item" :class="{ 'is-active': speed === 2 }" @click="setSpeed(2)">2×</button>
        </div>
        <button class="btn" @click="togglePlay">
          <Icon :name="playing ? 'pause' : 'play'" :size="14" />
          {{ playing ? '暂停' : '继续' }}
        </button>
        <button class="btn" @click="clearFeed">清空</button>
        <button class="btn btn--icon" :aria-label="immersive ? '退出沉浸' : '沉浸模式'" @click="toggleImmersive">
          <Icon :name="immersive ? 'compress' : 'expand'" :size="15" />
        </button>
      </div>
    </header>

    <section class="rt-kpis">
      <div class="rt-kpi">
        <span class="rt-kpi-label">当前速率</span>
        <div class="rt-kpi-value"><b class="num">{{ gbps }}</b><span>Gbps</span></div>
        <span class="rt-kpi-foot"><span class="chip chip--green">正常</span> 门限 15 Gbps</span>
      </div>
      <div class="rt-kpi">
        <span class="rt-kpi-label">消息速率</span>
        <div class="rt-kpi-value"><b class="num">{{ totalMsg }}</b><span>万条 / 秒</span></div>
        <span class="rt-kpi-foot"><span class="dot dot--pulse" style="color: #34d399" />3 个分区持续写入</span>
      </div>
      <div class="rt-kpi">
        <span class="rt-kpi-label">在线消费者</span>
        <div class="rt-kpi-value"><b class="num">{{ consumers.length }}</b><span>/ 3</span></div>
        <span class="rt-kpi-foot">{{ consumers.map((c) => c.id).join(' · ') }}</span>
      </div>
      <div class="rt-kpi">
        <span class="rt-kpi-label">分区最大滞后</span>
        <div class="rt-kpi-value"><b class="num">{{ lag }}</b><span>条</span></div>
        <span class="rt-kpi-foot"><span class="chip chip--amber">低于阈值</span> 阈值 500</span>
      </div>
    </section>

    <div class="rt-section"><h3>实时速率与告警</h3><span>观察当前网络是否稳定</span></div>
    <div class="rt-grid">
      <Panel data-template="G17" title="实时下行速率" sub="每 2 秒聚合一次 · 近 2 分钟">
        <template #actions>
          <span class="rt-legend"><i />Gbps</span>
        </template>
        <BaseChart :option="chartOption" height="300px" />
      </Panel>

      <Panel title="实时告警" sub="最近 10 分钟">
        <ul class="rt-alerts">
          <li v-for="(a, i) in alerts" :key="i">
            <span class="rt-level" :class="`is-${a.level}`">{{ a.level }}</span>
            <div>
              <p>{{ a.text }}</p>
              <span>{{ a.time }}</span>
            </div>
          </li>
        </ul>
        <button class="btn btn--sm rt-all" @click="ui.alertsOpen = true">打开告警中心</button>
      </Panel>
    </div>

    <div class="rt-section"><h3>消息与消费组</h3><span>排查数据处理情况</span></div>
    <div class="rt-bottom">
      <Panel title="实时消息流" sub="Kafka 消费记录 · 最新在上" flush>
        <div class="table-wrap">
          <table class="table table--compact">
            <thead>
              <tr><th>时间</th><th>小区</th><th>业务</th><th class="num">流量</th><th class="num">分区</th></tr>
            </thead>
            <tbody>
              <tr v-for="m in msgs" :key="m.id">
                <td class="mono">{{ m.time }}</td>
                <td>{{ m.cell }}</td>
                <td><span class="chip">{{ m.action }}</span></td>
                <td class="num">{{ fmtBytes(m.bytes) }}</td>
                <td class="num mono">P{{ m.partition }}</td>
              </tr>
              <tr v-if="!msgs.length">
                <td colspan="5" class="rt-empty">消息流已清空，等待新消息…</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="消费组分区分配" sub="Kafka 分区级负载均衡">
        <template #actions>
          <button class="btn btn--sm" @click="simulateScale">
            {{ consumers.length === 3 ? '模拟缩容' : '恢复 3 消费者' }}
          </button>
        </template>
        <div class="consumers">
          <div v-for="c in consumers" :key="c.id" class="consumer">
            <span class="c-dot" />
            <div class="c-body">
              <strong>{{ c.id }}</strong>
              <span>{{ c.host }} · {{ partitions.filter((p) => p.owner === c.id).length }} 个分区</span>
            </div>
            <span class="chip chip--green">在线</span>
          </div>
        </div>
        <div class="partitions">
          <div v-for="p in partitions" :key="p.id" class="partition">
            <span class="p-id mono">P{{ p.id }}</span>
            <TickMeter :value="partitionShare(p.rate)" :label="`分区 ${p.id} 消息份额`" />
            <span class="p-share num">{{ partitionShare(p.rate).toFixed(1) }}%</span>
            <span class="p-owner">{{ p.owner }}</span>
            <span class="p-lag num">滞后 {{ p.lag }} 条</span>
          </div>
        </div>
        <p class="chart-note">每刻度为当前总消息速率的 4% · 末刻度按比例显示</p>
        <div class="rebalance">
          <Icon name="layers" :size="13" />
          最近一次再均衡：{{ consumers.length === 3 ? '3 个消费者各持 1 个分区' : 'worker-3 退出，worker-1 接管分区 2' }}
        </div>
      </Panel>
    </div>
  </div>
</template>

<style scoped>
.rt {
  background:
    radial-gradient(900px 380px at 12% -10%, rgba(34, 211, 238, 0.1), transparent 60%),
    radial-gradient(700px 320px at 92% 4%, rgba(109, 92, 231, 0.12), transparent 60%),
    #070d19;
  border: 1px solid #1b2b47;
  border-radius: 16px;
  padding: 18px;
  min-height: calc(100vh - 140px);
  color: #e9f1ff;
}

.rt.is-immersive {
  position: fixed;
  inset: 0;
  z-index: 150;
  border-radius: 0;
  padding: 22px 28px;
  overflow: auto;
  min-height: 100vh;
}

.rt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.rt-title {
  display: flex;
  align-items: center;
  gap: 24px;
}

.live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 9px;
  border-radius: 6px;
  background: rgba(52, 211, 153, 0.12);
  color: #34d399;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  border: 1px solid rgba(52, 211, 153, 0.25);
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #34d399;
  box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.6);
  animation: pulse 1.8s infinite;
}

.rt-title h2 {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.rt-title p {
  font-size: 10.5px;
  color: #6d81a3;
  margin-top: 2px;
}

.rt-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rt-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.rt-kpi {
  padding: 13px 15px;
  border-radius: 11px;
  background: rgba(13, 22, 38, 0.85);
  border: 1px solid #1b2b47;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.rt-kpi-label {
  font-size: 10.5px;
  color: #6d81a3;
}

.rt-kpi-value {
  display: flex;
  align-items: baseline;
  gap: 5px;
  line-height: 1.1;
}

.rt-kpi-value b {
  font-size: 27px;
  font-weight: 650;
  letter-spacing: -0.03em;
  color: #e9f1ff;
}

.rt-kpi-value span {
  font-size: 11px;
  color: #6d81a3;
}

.rt-kpi-foot {
  font-size: 10px;
  color: #6d81a3;
  display: flex;
  align-items: center;
  gap: 5px;
}

.rt-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.9fr) minmax(0, 1fr);
  gap: 24px;
  margin-bottom: 12px;
}

.rt-bottom {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
  gap: 24px;
}

.rt-legend {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: #6d81a3;
}

.rt-legend i {
  width: 10px;
  height: 2px;
  border-radius: 2px;
  background: #22d3ee;
  display: block;
}

.consumers {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.consumer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  border-radius: 7px;
  background: rgba(16, 29, 51, 0.6);
  border: 1px solid #1b2b47;
}

.c-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #34d399;
  flex-shrink: 0;
}

.c-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.c-body strong {
  font-size: 11.5px;
  font-weight: 600;
}

.c-body span {
  font-size: 9.5px;
  color: #6d81a3;
}

.partitions {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 12px;
}

.partition {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) 58px 52px;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: #9fb2d1;
}

.p-id {
  color: #22d3ee;
  font-size: 9.5px;
}

.p-bar {
  height: 4px;
  border-radius: 999px;
  background: #16243c;
  overflow: hidden;
}

.p-bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #0891b2, #22d3ee);
  border-radius: 999px;
}

.p-owner {
  font-size: 9.5px;
  color: #9fb2d1;
}

.p-lag {
  text-align: right;
  font-size: 9.5px;
  color: #6d81a3;
}

.rebalance {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding-top: 9px;
  border-top: 1px dashed #1b2b47;
  font-size: 9.5px;
  color: #6d81a3;
}

.rt-alerts {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rt-alerts li {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 9px;
  border-radius: 7px;
  background: rgba(16, 29, 51, 0.55);
  border: 1px solid #1b2b47;
}

.rt-level {
  font-size: 9.5px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(217, 122, 0, 0.16);
  color: #fbbf24;
  flex-shrink: 0;
}

.rt-level.is-严重 {
  background: rgba(248, 113, 113, 0.16);
  color: #f87171;
}

.rt-level.is-提示 {
  background: rgba(56, 189, 248, 0.16);
  color: #38bdf8;
}

.rt-alerts p {
  font-size: 11px;
  color: #c7d5ec;
  line-height: 1.45;
}

.rt-alerts span {
  font-size: 9.5px;
  color: #6d81a3;
}

.rt-all {
  width: 100%;
  margin-top: 10px;
  justify-content: center;
}

.rt-empty {
  text-align: center;
  color: #6d81a3;
  padding: 22px;
  font-size: 11px;
}

@media (max-width: 1280px) {
  .rt-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .rt-grid, .rt-bottom { grid-template-columns: minmax(0, 1fr); }
  .rt-head { align-items: flex-start; flex-direction: column; }
}

.rt { padding: 28px; background: #0c1423; border: 0; border-radius: 22px; min-height: auto; }
.rt-head { margin-bottom: 26px; flex-wrap: wrap; gap: 20px; }
.rt-kpis { gap: 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); margin-bottom: 28px; }
.rt-kpi { border: 0; border-radius: 0; background: transparent; padding: 24px 20px; }
.rt-kpi:first-child { padding-left: 0; }
.rt-kpi + .rt-kpi { border-left: 1px solid var(--border); }
.rt-kpi-value b { font-size: 34px; }
.rt-kpi-label { font-size: 12px; }
.rt-kpi-foot { margin-top: 10px; font-size: 11px; }
.rt-section { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin: 28px 0 16px; }
.rt-section h3 { font-size: 14px; font-weight: 600; }
.rt-section span { font-size: 12px; color: var(--text-3); }
.rt-grid { grid-template-columns: minmax(0, 1.8fr) minmax(0, 1fr); }
.rt-bottom { grid-template-columns: minmax(0, 1.8fr) minmax(0, 1fr); }
.rt :deep(.panel) { background: #101c2e; box-shadow: none; }
.rt-alerts { gap: 16px; }
.rt-alerts li { padding: 14px; background: transparent; }
.rt-alerts p { font-size: 12px; line-height: 1.7; }
.consumer { padding: 12px; }
@media (max-width: 1200px) { .rt-grid, .rt-bottom { grid-template-columns: 1fr; } }
@media (max-width: 760px) {
  .rt { padding: 18px; }
  .rt-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .rt-kpi { padding: 20px 12px; }
  .rt-kpi:first-child { padding-left: 12px; }
  .rt-kpi:nth-child(3) { border-left: 0; border-top: 1px solid var(--border); }
  .rt-kpi:nth-child(4) { border-top: 1px solid var(--border); }
  .rt-kpi-value b { font-size: 26px; }
  .rt-section { flex-direction: column; gap: 6px; }
  .rt-actions { flex-wrap: wrap; }
}

.rt { --primary: #bad6eb; }
.rt-legend i { background: #bad6eb; }
.partition { grid-template-columns: 24px minmax(0, 1fr) 64px; gap: 5px 8px; }
.partitions { gap: 15px; }
.p-owner { grid-column: 2; }
.p-lag { grid-column: 3; }
.p-share { color: #bad6eb; font-size: 10px; text-align: right; }
.p-id { color: #bad6eb; }
</style>
