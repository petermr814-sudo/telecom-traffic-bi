<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import * as echarts from 'echarts'
import SkeletonLoader from './SkeletonLoader.vue'
import { CHART_FONT } from '@/lib/chart'

const props = withDefaults(defineProps<{ option: echarts.EChartsOption; height?: string; replaceMerge?: string[]; loading?: boolean; enterAnimation?: boolean }>(), {
  height: '260px',
  replaceMerge: () => [],
  enterAnimation: false
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
let mountedHost: HTMLDivElement | null = null

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
  // 顶层 textStyle 是全局默认：图例、标线、markPoint 等没单独写 fontFamily 的文本
  // 也统一用 MiSans，避免画布里混入 ECharts 默认字体；option 自己的 textStyle 仍然优先。
  const plain = toPlain(props.option)
  const payload = { ...plain, textStyle: { fontFamily: CHART_FONT, ...(plain.textStyle ?? {}) } }
  if (!payload.series) return
  // 加载过程由骨架屏呈现：首次渲染默认直接落定，避免图形展开形成大面积遮罩；
  // 动效画廊（enterAnimation）与后续更新保留 option 自身的动画配置
  if (!painted.value && !props.enterAnimation) payload.animation = false
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) payload.animation = false
  if (props.replaceMerge.length) {
    chart.value.setOption(payload, { replaceMerge: props.replaceMerge, lazyUpdate: false })
  } else {
    chart.value.setOption(payload, { notMerge: false, lazyUpdate: false })
  }
  painted.value = true
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
  mountedHost = host.value
  render()
  lastW = Math.round(el.value.getBoundingClientRect().width)
  lastH = Math.round(el.value.getBoundingClientRect().height)
  ro = new ResizeObserver((entries) => {
    const box = entries[0]?.contentRect
    if (!box) return
    const w = Math.round(box.width)
    const h = Math.round(box.height)
    if (w === lastW && h === lastH) return
    lastW = w
    lastH = h
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => chart.value?.resize(), 140)
  })
  ro.observe(el.value)
}

onMounted(() => {
  // 等当前页面 enter（0.24s）结束再初始化：过渡期间的
  // transform 会让 ECharts 的 tooltip 容器定位异常，表现为 hover 没有数字、
  // resize 报错。
  initTimer = window.setTimeout(() => waitAndInit(), 280)
})

// Loading and option commonly change in the same Vue flush. A single watcher
// prevents the second update from immediately cancelling the first morph.
watch([() => props.option, () => props.replaceMerge.join(','), () => props.loading], render)

onUnmounted(() => {
  disposed = true
  window.clearTimeout(initTimer)
  window.clearTimeout(resizeTimer)
  ro?.disconnect()
  if (mountedHost) delete (mountedHost as any).__chart
  if (chart.value) delete (chart.value.getDom() as any).__chart
  chart.value?.dispose()
  chart.value = null
})

function replay(event?: Event) {
  if (!painted.value || !chart.value) return
  // 顶层 textStyle 是全局默认：图例、标线、markPoint 等没单独写 fontFamily 的文本
  // 也统一用 MiSans，避免画布里混入 ECharts 默认字体；option 自己的 textStyle 仍然优先。
  const plain = toPlain(props.option)
  const payload = { ...plain, textStyle: { fontFamily: CHART_FONT, ...(plain.textStyle ?? {}) } }
  if (!payload.series) return
  const duration = Math.max(300, Math.min(4000, (event as CustomEvent)?.detail?.duration ?? 0))
  if (duration) {
    payload.animationDuration = duration
    payload.animationDurationUpdate = duration
    const series = Array.isArray(payload.series) ? payload.series : [payload.series]
    payload.series = series.map((item: any) => ({ ...item, animationDuration: duration, animationDurationUpdate: duration }))
  }
  // clear 后重新 setOption 会播放首次入场动画，用于「重播」演示；
  // clear 不会移除实例上注册的 click 事件监听
  chart.value.clear()
  chart.value.setOption(payload, { lazyUpdate: false })
}
defineExpose({ chart, getChart: () => chart.value, replay })
</script>

<template>
  <div ref="host" class="chart-box" :style="{ height }" :aria-busy="loading || !painted" @chart:replay="replay">
    <div ref="el" class="chart-surface" :style="{ visibility: painted ? 'visible' : 'hidden' }" />
    <Transition name="skeleton" :duration="300">
      <SkeletonLoader v-if="!painted" class="chart-loading" variant="chart" compact />
    </Transition>
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
.skeleton-leave-active { transition: opacity .3s ease; }
.skeleton-leave-to { opacity: 0; }
</style>
