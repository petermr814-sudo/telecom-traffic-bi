<script setup lang="ts">
import { useId } from 'vue'
withDefaults(defineProps<{ label?: string; compact?: boolean }>(), { label: '正在加载数据…', compact: false })
const filterId = `liquid-${useId().replace(/:/g, '')}`
</script>

<template>
  <div class="liquid-loader" :class="{ 'is-compact': compact }" role="status" :aria-label="label">
    <svg class="liquid-seed" viewBox="0 0 120 64" aria-hidden="true">
      <defs><filter :id="filterId" x="-50%" y="-100%" width="200%" height="300%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceGraphic" stdDeviation="3" /><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" /></filter></defs>
      <g :filter="`url(#${filterId})`" fill="currentColor">
        <ellipse class="seed-core" cx="60" cy="32" rx="20" ry="13" />
        <circle class="seed-drop seed-drop--a" cx="37" cy="32" r="8" />
        <circle class="seed-drop seed-drop--b" cx="83" cy="32" r="6" />
      </g>
    </svg>
    <span v-if="!compact" class="liquid-label">{{ label }}</span>
  </div>
</template>

<style scoped>
.liquid-loader { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 110px; color: var(--primary); }
.liquid-seed { width: 120px; height: 64px; overflow: visible; flex: 0 0 auto; }
.liquid-label { color: var(--text-3); font-size: 12px; }
.is-compact { min-height: 0; height: 100%; }
.is-compact .liquid-seed { width: 96px; height: 44px; }
.seed-core { transform-origin: 60px 32px; animation: liquid-breathe 1.8s ease-in-out infinite alternate; }
.seed-drop--a { animation: liquid-left 1.8s ease-in-out infinite alternate; }
.seed-drop--b { animation: liquid-right 1.8s ease-in-out infinite alternate; }
@keyframes liquid-breathe { from { transform: scale(1.08, .86); } to { transform: scale(.88, 1.08); } }
@keyframes liquid-left { from { transform: translate(12px, 3px); } to { transform: translate(-6px, -5px); } }
@keyframes liquid-right { from { transform: translate(-12px, -4px); } to { transform: translate(5px, 4px); } }
@media (prefers-reduced-motion: reduce) { .seed-core, .seed-drop { animation: none; } }
</style>
