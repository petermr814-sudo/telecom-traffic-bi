<script setup lang="ts">
// Adapted from Lieflat F11 Tick Gauge; license in public/third-party/.
import { computed } from 'vue'
const props = defineProps<{ value: number; warn: number; congest: number }>()
const point = (value: number, radius: number) => {
  const angle = (-195 + Math.max(0, Math.min(100, value)) / 100 * 210) * Math.PI / 180
  return { x: 160 + Math.cos(angle) * radius, y: 166 + Math.sin(angle) * radius }
}
const tone = computed(() => props.value >= props.congest ? 'var(--red)' : props.value >= props.warn ? 'var(--amber)' : 'var(--primary)')
const ticks = computed(() => Array.from({ length: 100 }, (_, index) => ({ start: point(index + .5, 106), end: point(index + .5, index + .5 < props.value ? 122 : 112), active: index + .5 < props.value })))
</script>

<template>
  <svg v-liquid data-liquid-svg class="tick-gauge" viewBox="0 0 320 218" role="img" :aria-label="`忙时利用率 ${value.toFixed(1)}%，预警 ${warn}%，拥塞 ${congest}%`" data-template="F11">
    <line v-for="(tick, index) in ticks" :key="index" :x1="tick.start.x" :y1="tick.start.y" :x2="tick.end.x" :y2="tick.end.y" :stroke="tick.active ? tone : 'var(--border-strong)'" :stroke-width="tick.active ? 1.7 : 1" />
    <circle :cx="point(value, 129).x" :cy="point(value, 129).y" r="3" :fill="tone" />
    <text x="160" y="150" text-anchor="middle" class="gauge-value" :fill="tone">{{ value.toFixed(1) }}<tspan class="gauge-unit">%</tspan></text>
    <text x="160" y="177" text-anchor="middle" class="gauge-label">忙时利用率</text>
    <text x="160" y="209" text-anchor="middle" class="gauge-caption">预警 {{ warn }}% · 拥塞 {{ congest }}% · 每刻度 1%</text>
  </svg>
</template>

<style scoped>
.tick-gauge { width: 100%; max-width: 320px; display: block; margin: 0 auto; }
.gauge-value { font-size: 40px; font-weight: 650; letter-spacing: -1.6px; }
.gauge-unit { font-size: 18px; }
.gauge-label { fill: var(--text-2); font-size: 13px; }
.gauge-caption { fill: var(--text-3); font-size: 10px; }
</style>
