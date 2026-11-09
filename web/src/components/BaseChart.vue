<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import * as echarts from 'echarts'
import LiquidLoader from './LiquidLoader.vue'
import { LiquidChartMotion, liquidKind } from '@/lib/liquidMotion'

const props = withDefaults(defineProps<{ option: echarts.EChartsOption; height?: string; replaceMerge?: string[]; loading?: boolean }>(), {
  height: '260px',
  replaceMerge: () => []
})

const emit = defineEmits<{ (e: 'chart-click', params: any): void }>()

const el = ref<HTMLDivElement | null>(null)
const host = ref<HTMLDivElement | null>(null)
const painted = ref(false)
// ECharts 实例必须用 shallowRef：深层响应式代理会破坏内部 this/坐标系统，
// 表现为 tooltip 不显示、resize 报 “reading 'type'”。
const chart = shallowRef<echarts.ECharts | null>(null)
let ro: ResizeObserver | null = null
let resizeTimer = 0
let lastW = 0
let lastH = 0
let initTimer = 0
let disposed = false
let motion: LiquidChartMotion | null = null

function toPlain(value: any): any {
  if (Array.isArray(value)) return value.map(toPlain)
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, any> = {}
    for (const key of Object.keys(value)) out[key] = toPlain(value[key])
    return out
  }
  return value
}

function render() {
  if (!chart.value || (!painted.value && props.loading)) return
  const payload = toPlain(props.option)
  if (!payload.series) return
  motion?.finish()
  const first = !painted.value
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  payload.animation = first || reduced ? false : (payload.animation ?? true)
  // The liquid pass needs final geometry, including symbols and marker paths.
  if (first || reduced) {
    const series = Array.isArray(payload.series) ? payload.series : [payload.series]
    payload.series = series.map((item: any) => ({ ...item, animation: false }))
  }
  if (props.replaceMerge.length) {
    chart.value.setOption(payload, { replaceMerge: props.replaceMerge, lazyUpdate: false })
  } else {
    chart.value.setOption(payload, { notMerge: false, lazyUpdate: false })
  }
  if (first) {
    painted.value = true
    motion?.play(liquidKind(props.option))
  }
}

function waitAndInit(tries = 0) {
  if (disposed || !el.value || !host.value) return
  const rect = el.value.getBoundingClientRect()
  if (rect.width < 20 && tries < 40) {
    initTimer = window.setTimeout(() => waitAndInit(tries + 1), 50)
    return
  }
  chart.value = echarts.init(el.value, undefined, { renderer: 'canvas' })
  chart.value.on('click', (params) => emit('chart-click', params))
  ;(el.value as any).__chart = chart.value
  ;(host.value as any).__chart = chart.value
  motion = new LiquidChartMotion(chart.value, host.value)
  render()
  lastW = Math.round(el.value.getBoundingClientRect().width)
  lastH = Math.round(el.value.getBoundingClientRect().height)
  ro = new ResizeObserver((entries) => {
    const box = entries[0]?.contentRect
    if (!box) return
    const w = Math.round(box.width)
    const h = Math.round(box.height)
    if (w === lastW && h === lastH) return
    motion?.finish()
    lastW = w
    lastH = h
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => chart.value?.resize(), 140)
  })
  ro.observe(el.value)
}

onMounted(() => {
  // 等页面切换过渡（leave 0.16s + enter 0.24s）结束再初始化：过渡期间的
  // transform 会让 ECharts 的 tooltip 容器定位异常，表现为 hover 没有数字、
  // resize 报错。
  initTimer = window.setTimeout(() => waitAndInit(), 280)
})

watch(() => props.option, render)
watch(() => props.replaceMerge, render, { deep: true })
watch(() => props.loading, render)

onUnmounted(() => {
  disposed = true
  window.clearTimeout(initTimer)
  window.clearTimeout(resizeTimer)
  ro?.disconnect()
  motion?.dispose()
  chart.value?.dispose()
})

function replay(event?: Event) {
  const duration = Math.max(300, Math.min(4000, (event as CustomEvent)?.detail?.duration ?? 760))
  if (painted.value) motion?.play(liquidKind(props.option), undefined, duration)
}
defineExpose({ chart, getChart: () => chart.value, replay, finishLoadingMotion: () => motion?.finish() })
</script>

<template>
  <div ref="host" class="chart-box" :style="{ height }" :aria-busy="loading || !painted" @liquid:replay="replay">
    <div ref="el" class="chart-surface" :style="{ visibility: painted ? 'visible' : 'hidden' }" />
    <LiquidLoader v-if="!painted" class="chart-loading" compact />
  </div>
</template>

<style scoped>
.chart-box {
  position: relative;
  width: 100%;
  min-width: 0;
}
.chart-surface { width: 100%; height: 100%; }
.chart-loading { position: absolute; inset: 0; pointer-events: none; }
</style>
