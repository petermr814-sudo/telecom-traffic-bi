<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ value: number; label: string }>()
const filled = computed(() => Math.max(0, Math.min(100, props.value)) / 4)
</script>

<template>
  <svg v-liquid data-liquid-svg class="tick-meter" viewBox="0 0 150 18" role="img" :aria-label="`${label} ${value.toFixed(1)}%`" data-template="F5">
    <line v-for="index in 25" :key="`track-${index}`" :x1="index * 5.8" :x2="index * 5.8" y1="4" y2="14" stroke="var(--border-strong)" stroke-width="2" />
    <line v-for="index in Math.ceil(filled)" :key="index" :x1="index * 5.8" :x2="index * 5.8" y1="14" :y2="14 - Math.min(1, filled - index + 1) * 10" stroke="var(--primary)" stroke-width="2" />
  </svg>
</template>

<style scoped>
.tick-meter { width: 100%; height: 18px; display: block; }
</style>
