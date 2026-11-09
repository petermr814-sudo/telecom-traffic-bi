<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseChart from '@/components/BaseChart.vue'
import Panel from '@/components/Panel.vue'
import KpiCard from '@/components/KpiCard.vue'
import ProcessFlow from '@/components/ProcessFlow.vue'
import ShareWaffle from '@/components/ShareWaffle.vue'
import { C, axisLabel, splitLine, tooltipBase } from '@/lib/chart'
import { tickRowsOption, utilizationHistogram } from '@/lib/chartTemplates'

const root = ref<HTMLElement | null>(null)
const slow = ref(false)
function replay(target: Element | null = root.value) {
  const duration = slow.value ? 2400 : 980
  target?.querySelectorAll('.chart-box, [data-text-reveal]').forEach(el => {
    el.dispatchEvent(new CustomEvent('chart:replay', { detail: { duration } }))
    el.dispatchEvent(new CustomEvent('text:replay'))
  })
}
const points = [28, 25, 22, 21, 24, 31, 48, 61, 55, 67, 73, 65, 58, 62, 71, 77, 74, 84, 91, 80, 68, 53, 42, 35]
const grid = { left: 34, right: 14, top: 22, bottom: 26 }
const xAxis = { type: 'category', data: points.map((_, i) => `${i}h`), axisLabel, axisLine: { lineStyle: { color: C.border } }, axisTick: { show: false } }
const yAxis = { type: 'value', axisLabel, splitLine, splitNumber: 3 }
const charts = computed(() => [
  { key: 'line', title: '折线 · 从左生长', sub: '线条自左侧绘制延伸，采样点随线就位。', option: { animationDuration: 700, animationType: 'expand', grid, xAxis, yAxis, tooltip: { trigger: 'axis', ...tooltipBase }, series: [{ type: 'line', data: points, symbolSize: 4, lineStyle: { color: C.primary, width: 1.8 }, itemStyle: { color: C.primary } }] } },
  { key: 'ticks', title: '刻度 · 各行就位', sub: '刻度行整体落定，保持行的阅读顺序。', option: tickRowsOption(['华东', '华南', '华北', '西南', '华中'].map((name, i) => ({ name, value: 95 - i * 16, label: `${95 - i * 16}`, detail: `${95 - i * 16} TB` })), 4) },
  { key: 'bar', title: '柱形 · 分箱就位', sub: '利用率分箱逐档呈现，峰值档同步标注。', option: utilizationHistogram(Array.from({ length: 180 }, (_, i) => 20 + Math.abs(Math.sin(i * 1.7)) * 73), 70, 85).option },
  { key: 'heatmap', title: '热力 · 逐格点亮', sub: '每个格子依次出现，色阶随数值定下。', option: { animationDuration: 420, animationDelay: (idx: number) => (idx % 24) * 14 + Math.floor(idx / 24) * 8, grid, tooltip: { ...tooltipBase, trigger: 'axis' }, xAxis: { type: 'category', data: points.map((_, i) => `${i}h`), axisLabel, axisLine: { show: false }, axisTick: { show: false } }, yAxis: { type: 'category', data: ['一', '二', '三', '四', '五', '六', '日'], axisLabel, axisLine: { show: false }, axisTick: { show: false } }, visualMap: { show: false, type: 'continuous', min: 0, max: 100, inRange: { color: ['#bad6eb', '#7096d1', '#334eac'] } }, series: [{ type: 'heatmap', data: Array.from({ length: 168 }, (_, i) => [i % 24, Math.floor(i / 24), 15 + points[i % 24] * (.5 + Math.floor(i / 24) / 8)]), itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 2 } }] } },
  { key: 'scatter', title: '散点 · 依次散开', sub: '圆点分批放大，回到各自的真实坐标。', option: { animationDuration: 620, animationDelay: (idx: number) => (idx % 16) * 30, grid, xAxis: { ...yAxis, splitLine: { show: false } }, yAxis, tooltip: tooltipBase, series: [{ type: 'scatter', data: Array.from({ length: 64 }, (_, i) => [10 + (i * 37) % 100, 12 + (i * 23) % 80]), symbolSize: (_: any, p: any) => 5 + p.dataIndex % 6, itemStyle: { color: C.primary, opacity: .75 } }] } },
  { key: 'ring', title: '环图 · 绕心成环', sub: '弧段自中心展开，填充为准确的占比。', option: { animationDuration: 700, tooltip: { ...tooltipBase, trigger: 'item' }, series: [{ type: 'pie', center: ['50%', '48%'], radius: ['53%', '75%'], label: { show: false }, itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 4 }, data: [{ value: 68, name: '5G', itemStyle: { color: C.primary } }, { value: 32, name: '4G', itemStyle: { color: '#a6bddb' } }] }] } },
] as any[])
</script>

<template>
  <div ref="root" class="motion-gallery">
    <header class="motion-intro">
      <div><span class="motion-eyebrow">LOADING / DATA IN MOTION</span><h2 v-text-reveal>数据，以各自的方式成形。</h2><p>每类图表用自己的动画完成加载：折线生长、柱子就位、圆点散开……示例数据仅用于演示加载效果。</p></div>
      <div class="motion-tools"><label><input v-model="slow" type="checkbox" />慢放</label><button class="btn btn--primary" @click="replay()">全部重播 ↻</button></div>
    </header>
    <div class="motion-kpis"><KpiCard label="总流量" value="128.6" unit="TB" :delta="8.4" /><KpiCard label="活跃用户" value="386.2" unit="万" :delta="3.2" /><KpiCard label="峰值速率" value="42.8" unit="Gbps" :delta="5.6" /></div>
    <div class="motion-grid">
      <Panel v-for="item in charts" :key="item.key" :title="item.title" :sub="item.sub" :data-demo="item.key">
        <template #actions><button class="btn btn--sm" :aria-label="`重播${item.title}`" @click="replay(($event.currentTarget as HTMLElement).closest('.panel') as HTMLElement | null)">重播 ↻</button></template>
        <BaseChart :option="item.option" height="230px" enter-animation />
      </Panel>
      <Panel title="流程 · 依次显现" sub="节点序号逐字浮现，保持链路的阅读顺序。" data-demo="flow"><template #actions><button class="btn btn--sm" @click="replay(($event.currentTarget as HTMLElement).closest('.panel') as HTMLElement | null)">重播 ↻</button></template><div class="motion-flow"><ProcessFlow :stages="[{ name: '采集', detail: '接入数据', metric: '已就绪', status: '正常' }, { name: '处理', detail: '聚合计算', metric: '已就绪', status: '正常' }, { name: '呈现', detail: '生成图表', metric: '已就绪', status: '正常' }]" /></div></Panel>
      <Panel title="构成 · 点阵成形" sub="100 个圆点逐行点亮，颜色对应原有时段构成。" data-demo="waffle"><template #actions><button class="btn btn--sm" @click="replay(($event.currentTarget as HTMLElement).closest('.panel') as HTMLElement | null)">重播 ↻</button></template><ShareWaffle :items="[{ name: '日间', value: 58, color: C.primary }, { name: '晚间', value: 29, color: '#7096d1' }, { name: '凌晨', value: 13, color: '#a6bddb' }]" /></Panel>
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
.motion-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
.motion-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
.motion-grid :deep(.panel-head) { flex-wrap: wrap; gap: 12px; }
.motion-grid :deep(.panel-sub) { font-size: 12px; }
.motion-flow { display: grid; align-items: center; min-height: 230px; }
@media (max-width: 760px) { .motion-intro { align-items: flex-start; flex-direction: column; } .motion-grid, .motion-kpis { grid-template-columns: 1fr; } }
</style>
