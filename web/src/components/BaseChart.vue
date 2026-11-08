<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import * as echarts from 'echarts'

const props = withDefaults(defineProps<{ option: echarts.EChartsOption; height?: string; replaceMerge?: string[] }>(), {
  height: '260px',
  replaceMerge: () => []
})

const emit = defineEmits<{ (e: 'chart-click', params: any): void }>()

const el = ref<HTMLDivElement | null>(null)
// ECharts 实例必须用 shallowRef：深层响应式代理会破坏内部 this/坐标系统，
// 表现为 tooltip 不显示、resize 报 “reading 'type'”。
const chart = shallowRef<echarts.ECharts | null>(null)
let ro: ResizeObserver | null = null
let resizeTimer = 0
let lastW = 0
let lastH = 0

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
  if (!chart.value) return
  const payload = toPlain(props.option)
  if (props.replaceMerge.length) {
    chart.value.setOption(payload, { replaceMerge: props.replaceMerge, lazyUpdate: false })
  } else {
    chart.value.setOption(payload, { notMerge: false, lazyUpdate: false })
  }
}

function waitAndInit(tries = 0) {
  if (!el.value) return
  const rect = el.value.getBoundingClientRect()
  if (rect.width < 20 && tries < 40) {
    window.setTimeout(() => waitAndInit(tries + 1), 50)
    return
  }
  chart.value = echarts.init(el.value, undefined, { renderer: 'canvas' })
  chart.value.on('click', (params) => emit('chart-click', params))
  ;(el.value as any).__chart = chart.value
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
  // 等页面切换的 0.2s 过渡结束再初始化：过渡期间的 transform 会让 ECharts
  // 的 tooltip 容器定位异常，表现为 hover 没有数字、resize 报错。
  window.setTimeout(() => waitAndInit(), 320)
})

watch(() => props.option, render)
watch(() => props.replaceMerge, render, { deep: true })

onUnmounted(() => {
  window.clearTimeout(resizeTimer)
  ro?.disconnect()
  chart.value?.dispose()
})

defineExpose({ chart })
</script>

<template>
  <div ref="el" class="chart-box" :style="{ height }" />
</template>

<style scoped>
.chart-box {
  width: 100%;
  min-width: 0;
}
</style>
