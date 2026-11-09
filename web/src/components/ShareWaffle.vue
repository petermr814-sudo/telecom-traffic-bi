<script setup lang="ts">
// Adapted from Lieflat G4 Dot Waffle; license in public/third-party/.
import { computed } from 'vue'
const props = defineProps<{ items: { name: string; value: number; color: string }[] }>()
const groups = computed(() => {
  const total = props.items.reduce((sum, item) => sum + Math.max(0, item.value), 0)
  const list = props.items.map(item => ({ ...item, share: total ? Math.max(0, item.value) / total * 100 : 0, count: 0 }))
  list.forEach(item => { item.count = Math.floor(item.share) })
  let remainder = total ? 100 - list.reduce((sum, item) => sum + item.count, 0) : 0
  const order = list.map((item, index) => ({ index, fraction: item.share - item.count })).sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (const item of order) { if (remainder-- <= 0) break; list[item.index].count++ }
  return list
})
const dots = computed(() => groups.value.flatMap(item => Array.from({ length: item.count }, () => item)))
const description = computed(() => groups.value.map(item => `${item.name} ${item.share.toFixed(1)}%`).join('，'))
</script>

<template>
  <div class="share-waffle" data-template="G4">
    <svg viewBox="0 0 300 145" role="img" :aria-label="description">
      <circle v-for="(item, index) in dots" :key="index" class="waffle-dot-anim" :style="{ animationDelay: `${Math.floor(index / 20) * 110 + (index % 20) * 7}ms` }" :cx="10 + (index % 20) * 14.7" :cy="14 + Math.floor(index / 20) * 25" r="5.2" :fill="item.color" :data-group="item.name"><title>{{ item.name }} · {{ item.share.toFixed(1) }}%</title></circle>
    </svg>
    <ul class="waffle-legend">
      <li v-for="item in groups" :key="item.name"><span class="waffle-dot" :style="{ background: item.color }" /><span>{{ item.name }}</span><strong class="num">{{ item.share.toFixed(1) }}%</strong></li>
    </ul>
    <p class="chart-note">每个点约占全天 1% · 点数按余数分配，合计 100 点</p>
  </div>
</template>

<style scoped>
svg { display: block; width: 100%; max-width: 380px; margin: 0 auto 8px; }
.waffle-dot-anim {
  transform-box: fill-box;
  transform-origin: center;
  animation: dot-pop .28s cubic-bezier(.34, 1.4, .64, 1) backwards;
}
@keyframes dot-pop { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .waffle-dot-anim { animation: none; } }
.waffle-legend { display: flex; flex-direction: column; gap: 12px; }
.waffle-legend li { display: flex; align-items: center; gap: 9px; color: var(--text-2); font-size: 12px; }
.waffle-legend strong { margin-left: auto; font-size: 13px; color: var(--text); }
.waffle-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
</style>
