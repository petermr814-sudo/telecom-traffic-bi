<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseChart from '@/components/BaseChart.vue'
import Panel from '@/components/Panel.vue'
import KpiCard from '@/components/KpiCard.vue'
import ProcessFlow from '@/components/ProcessFlow.vue'
import ShareWaffle from '@/components/ShareWaffle.vue'
import LiquidLoader from '@/components/LiquidLoader.vue'
import { C, axisLabel, splitLine, tooltipBase } from '@/lib/chart'
import { dotHeatOption, tickRowsOption, utilizationHistogram } from '@/lib/chartTemplates'

const root = ref<HTMLElement | null>(null)
const slow = ref(false)
const frames = ['轻柔蓄势', '有序延展', '平稳落定']
function replay(target: Element | null = root.value) {
  target?.querySelectorAll('.chart-box, [data-liquid-reveal]').forEach(el => el.dispatchEvent(new CustomEvent('liquid:replay', { detail: { duration: slow.value ? 2400 : 980 } })))
}
const points = [28, 25, 22, 21, 24, 31, 48, 61, 55, 67, 73, 65, 58, 62, 71, 77, 74, 84, 91, 80, 68, 53, 42, 35]
const grid = { left: 34, right: 14, top: 22, bottom: 26 }
const xAxis = { type: 'category', data: points.map((_, i) => `${i}h`), axisLabel, axisLine: { lineStyle: { color: C.border } }, axisTick: { show: false } }
const yAxis = { type: 'value', axisLabel, splitLine, splitNumber: 3 }
const charts = computed(() => [
  { key: 'line', title: '折线 · 液流牵引', sub: '液滴伸展成连续走势，收束为细线与采样点。', option: { grid, xAxis, yAxis, tooltip: { trigger: 'axis', ...tooltipBase }, series: [{ type: 'line', data: points, symbolSize: 4, lineStyle: { color: C.primary, width: 1.8 }, itemStyle: { color: C.primary } }] } },
  { key: 'ticks', title: '刻度 · 分流成列', sub: '细流沿各行铺开，凝成原有的流量刻度。', option: tickRowsOption(['华东', '华南', '华北', '西南', '华中'].map((name, i) => ({ name, value: 95 - i * 16, label: `${95 - i * 16}`, detail: `${95 - i * 16} TB` })), 4) },
  { key: 'bar', title: '柱形 · 向上凝聚', sub: '液态轮廓向上生长，形成连续区间的横档。', option: utilizationHistogram(Array.from({ length: 180 }, (_, i) => 20 + Math.abs(Math.sin(i * 1.7)) * 73), 70, 85).option },
  { key: 'heatmap', title: '热力 · 分裂归位', sub: '同一液团分散为点阵，面积与色阶随之落定。', option: dotHeatOption(Array.from({ length: 168 }, (_, i) => [i % 24, Math.floor(i / 24), 15 + points[i % 24] * (.5 + Math.floor(i / 24) / 8)]), points.map((_, i) => `${i}h`), ['一', '二', '三', '四', '五', '六', '日'], v => `${v.toFixed(0)} TB`, { maskRow: 0, ringH: 18, ringD: 6, ringVF: 1, ink: 1, draw: 1, selected: 0 }) },
  { key: 'scatter', title: '散点 · 流动散开', sub: '液滴逐渐分离，回到各自的真实坐标和大小。', option: { grid, xAxis: { ...yAxis, splitLine: { show: false } }, yAxis, tooltip: tooltipBase, series: [{ type: 'scatter', data: Array.from({ length: 64 }, (_, i) => [10 + (i * 37) % 100, 12 + (i * 23) % 80]), symbolSize: (_: any, p: any) => 5 + p.dataIndex % 6, itemStyle: { color: C.primary, opacity: .75 } }] } },
  { key: 'ring', title: '环图 · 绕心成环', sub: '液滴绕圆心延展，填充为准确的占比弧段。', option: { tooltip: { ...tooltipBase, trigger: 'item' }, series: [{ type: 'pie', center: ['50%', '48%'], radius: ['53%', '75%'], label: { show: false }, itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 4 }, data: [{ value: 68, name: '5G', itemStyle: { color: C.primary } }, { value: 32, name: '4G', itemStyle: { color: '#a6bddb' } }] }] } },
] as any[])
</script>

<template>
  <div ref="root" class="motion-gallery">
    <header class="motion-intro">
      <div><span class="motion-eyebrow">LIQUID / DATA IN MOTION</span><h2>让数据，从液态中成形。</h2><p>同一份图形，流动到最终位置。示例数据仅用于演示加载效果。</p></div>
      <div class="motion-tools"><label><input v-model="slow" type="checkbox" />慢放</label><button class="btn btn--primary" @click="replay()">全部重播 ↻</button></div>
    </header>
    <div class="motion-principle"><LiquidLoader compact /><div><strong>一个液态母形</strong><span v-for="(frame, i) in frames" :key="frame"><b>0{{ i + 1 }}</b>{{ frame }}</span></div><p>位置 · 颜色 · 线宽 · 数据一致</p></div>
    <div class="motion-kpis"><KpiCard label="总流量" value="128.6" unit="TB" :delta="8.4" /><KpiCard label="活跃用户" value="386.2" unit="万" :delta="3.2" /><KpiCard label="峰值速率" value="42.8" unit="Gbps" :delta="5.6" /></div>
    <div class="motion-grid">
      <Panel v-for="item in charts" :key="item.key" :title="item.title" :sub="item.sub" :data-demo="item.key">
        <template #actions><button class="btn btn--sm" :aria-label="`重播${item.title}`" @click="replay(($event.currentTarget as HTMLElement).closest('.panel') as HTMLElement | null)">重播 ↻</button></template>
        <BaseChart :option="item.option" height="230px" />
      </Panel>
      <Panel title="流程 · 依次显现" sub="轻柔展开节点，保持链路的阅读顺序。" data-demo="flow"><template #actions><button class="btn btn--sm" @click="replay(($event.currentTarget as HTMLElement).closest('.panel') as HTMLElement | null)">重播 ↻</button></template><div class="motion-flow"><ProcessFlow :stages="[{ name: '采集', detail: '接入数据', metric: '已就绪', status: '正常' }, { name: '处理', detail: '聚合计算', metric: '已就绪', status: '正常' }, { name: '呈现', detail: '生成图表', metric: '已就绪', status: '正常' }]" /></div></Panel>
      <Panel title="构成 · 点阵成形" sub="100 个圆点就位，颜色对应原有时段构成。" data-demo="waffle"><template #actions><button class="btn btn--sm" @click="replay(($event.currentTarget as HTMLElement).closest('.panel') as HTMLElement | null)">重播 ↻</button></template><ShareWaffle :items="[{ name: '日间', value: 58, color: C.primary }, { name: '晚间', value: 29, color: '#7096d1' }, { name: '凌晨', value: 13, color: '#a6bddb' }]" /></Panel>
    </div>
  </div>
</template>

<style scoped>
.motion-gallery { display: flex; flex-direction: column; gap: 24px; padding-bottom: 30px; }
.motion-intro { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding: 8px 0; }
.motion-eyebrow { font: 11px var(--mono); letter-spacing: .14em; color: var(--primary); }
h2 { font-size: clamp(22px, 2.6vw, 32px); font-weight: 600; letter-spacing: -.035em; margin: 12px 0; }
.motion-intro p { color: var(--text-3); font-size: 13px; line-height: 1.7; }
.motion-tools { display: flex; gap: 18px; align-items: center; flex-shrink: 0; }
.motion-tools label { display: flex; gap: 8px; align-items: center; font-size: 12px; color: var(--text-2); }
.motion-principle { display: flex; align-items: center; gap: 18px; padding: 14px 24px; border: 1px solid var(--primary-border); border-radius: 16px; background: var(--primary-soft); }
.motion-principle > div { display: flex; align-items: center; gap: 28px; }
.motion-principle strong { font-size: 13px; font-weight: 550; }
.motion-principle span { color: var(--text-2); font-size: 12px; white-space: nowrap; }
.motion-principle b { font: 10px var(--mono); color: var(--primary); margin-right: 8px; }
.motion-principle p { margin-left: auto; color: var(--text-3); font-size: 11px; }
.motion-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
.motion-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
.motion-grid :deep(.panel-head) { flex-wrap: wrap; gap: 12px; }
.motion-grid :deep(.panel-sub) { font-size: 12px; }
.motion-flow { display: grid; align-items: center; min-height: 230px; }
@media (max-width: 1100px) { .motion-principle p { display: none; } .motion-principle > div { gap: 16px; } }
@media (max-width: 760px) { .motion-intro { align-items: flex-start; flex-direction: column; } .motion-grid, .motion-kpis { grid-template-columns: 1fr; } .motion-principle { padding: 12px; gap: 4px; } .motion-principle > div { flex-wrap: wrap; gap: 10px; } .motion-principle strong { width: 100%; } }
</style>
