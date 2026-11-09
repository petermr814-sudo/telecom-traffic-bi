<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsOption } from 'echarts'
import Modal from './Modal.vue'
import Icon from './Icon.vue'
import BaseChart from './BaseChart.vue'
import TickGauge from './TickGauge.vue'
import { axisLabel, C } from '@/lib/chart'
import { fmtBytes, fmtInt, fmtRate } from '@/lib/format'
import { toast, ui } from '@/stores/ui'

const open = computed(() => Boolean(ui.cellDetail))
const cell = computed(() => ui.cellDetail)

const days = ['11-02', '11-03', '11-04', '11-05', '11-06', '11-07', '11-08']

const trendOption = computed<EChartsOption>(() => ({
  animationDuration: 500,
  grid: { left: 4, right: 14, top: 20, bottom: 8, containLabel: true },
  tooltip: {
    trigger: 'axis',
    backgroundColor: '#0c1526',
    borderWidth: 0,
    textStyle: { color: '#fff', fontSize: 11 },
    formatter: (params) => { const p = Array.isArray(params) ? params[0] : params; return `${p.name}<br/>忙时利用率 <b>${p.value}%</b>` }
  },
  xAxis: {
    type: 'category',
    data: days,
    axisLine: { lineStyle: { color: '#e6ebf4' } },
    axisTick: { show: true, length: 6, lineStyle: { color: C.border } },
    axisLabel: { ...axisLabel, fontSize: 10 }
  },
  yAxis: {
    type: 'value',
    min: 0,
    max: 100,
    splitNumber: 2,
    axisLabel: { color: '#8b97ad', fontSize: 10, formatter: '{value}%' },
    splitLine: { lineStyle: { color: '#eef2f8' } }
  },
  series: [
    {
      type: 'line',
      smooth: false,
      symbol: 'circle',
      symbolSize: 5,
      data: cell.value?.trend ?? [],
      lineStyle: { color: C.primary, width: 1.6 },
      itemStyle: { color: C.primary },
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: '#dc2f2f', type: 'dashed', width: 1 },
        label: { formatter: '拥塞', color: '#dc2f2f', fontSize: 9, position: 'insideEndTop' },
        data: [{ yAxis: ui.settings.congest }]
      }
    }
  ]
}))

function addToPlan() {
  if (!cell.value) return
  toast('success', '已加入扩容清单', `${cell.value.name} · 建议扩容 ${Math.ceil(cell.value.headroomMbps > 0 ? 0 : 1)} 个载波`)
  ui.cellDetail = null
}

async function copyId() {
  if (!cell.value) return
  try {
    await navigator.clipboard.writeText(cell.value.id)
    toast('success', '已复制小区编号', cell.value.id)
  } catch {
    toast('error', '复制失败', '浏览器未授权剪贴板')
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="cell?.name ?? '小区详情'"
    :sub="cell ? `${cell.province} · ${cell.city} · ${cell.id}` : ''"
    width="480px"
    @close="ui.cellDetail = null"
  >
    <template v-if="cell">
      <div class="tags">
        <span class="chip" :class="cell.generation === '5G' ? 'chip--blue' : 'chip--violet'">{{ cell.generation }}</span>
        <span class="chip">{{ cell.type }}</span>
        <span class="chip" :class="cell.status === '拥塞' ? 'chip--red' : cell.status === '预警' ? 'chip--amber' : 'chip--green'">
          {{ cell.status }}
        </span>
      </div>

      <TickGauge :value="cell.util" :warn="ui.settings.warn" :congest="ui.settings.congest" />

      <div class="metrics">
        <div class="metric"><span>带宽</span><strong class="num">{{ fmtRate(cell.bandwidthMbps * 1e6) }}</strong></div>
        <div class="metric"><span>忙时速率</span><strong class="num">{{ fmtRate(cell.busyMbps * 1e6) }}</strong></div>
        <div class="metric"><span>剩余容量</span><strong class="num">{{ fmtRate(cell.headroomMbps * 1e6) }}</strong></div>
        <div class="metric"><span>接入用户</span><strong class="num">{{ fmtInt(cell.users) }}</strong></div>
        <div class="metric"><span>日流量</span><strong class="num">{{ fmtBytes(cell.traffic) }}</strong></div>
        <div class="metric"><span>所属区域</span><strong>{{ cell.region }}</strong></div>
      </div>

      <div class="chart-title">近 7 天忙时利用率</div>
      <BaseChart data-template="F2" :option="trendOption" height="160px" />

      <div class="note">
        <Icon name="info" :size="14" />
        <p>
          阈值 {{ ui.settings.warn }}% / {{ ui.settings.congest }}%。利用率连续 3 天超过拥塞阈值，建议在扩容清单中新增载波或调整邻区负载。
        </p>
      </div>
    </template>

    <template #footer>
      <button class="btn btn--ghost" @click="copyId"><Icon name="copy" :size="14" />复制编号</button>
      <button class="btn" @click="ui.cellDetail = null">关闭</button>
      <button class="btn btn--primary" @click="addToPlan"><Icon name="plus" :size="14" />加入扩容清单</button>
    </template>
  </Modal>
</template>

<style scoped>
.tags {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
}

.hero {
  padding: 4px 0 14px;
}

.hero-value {
  font-size: 40px;
  font-weight: 650;
  letter-spacing: -0.04em;
  line-height: 1;
}

.hero-value span {
  font-size: 16px;
  color: var(--text-3);
  margin-left: 2px;
}

.hero-label {
  margin-top: 5px;
  font-size: 11.5px;
  color: var(--text-3);
}

.hero-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--surface-3);
  margin-top: 12px;
  overflow: hidden;
}

.hero-bar span {
  display: block;
  height: 100%;
  border-radius: 999px;
}

.metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--border);
  border: 1px solid var(--border);
  border-radius: 9px;
  overflow: hidden;
}

.metric {
  background: var(--surface);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.metric span {
  font-size: 10.5px;
  color: var(--text-3);
}

.metric strong {
  font-size: 13px;
  font-weight: 550;
  color: var(--text);
}

.chart-title {
  margin: 18px 0 4px;
  font-size: 12px;
  font-weight: 600;
}

.note {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  padding: 10px 11px;
  background: var(--primary-soft);
  border-radius: 8px;
  color: var(--primary);
}

.note p {
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-2);
}
</style>
