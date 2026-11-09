<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'chart' | 'line'; label?: string; compact?: boolean }>(), {
  variant: 'chart', label: '', compact: false,
})
</script>

<template>
  <div class="skeleton" :class="[`skeleton--${variant}`, { 'is-compact': compact }]" role="status" :aria-label="label || '正在加载…'">
    <div v-if="variant === 'chart'" class="skeleton-chart" aria-hidden="true">
      <div class="skeleton-bar" style="height: 38%" />
      <div class="skeleton-bar" style="height: 62%" />
      <div class="skeleton-bar" style="height: 28%" />
      <div class="skeleton-bar" style="height: 74%" />
      <div class="skeleton-bar" style="height: 46%" />
    </div>
    <div v-else class="skeleton-line" aria-hidden="true" />
    <span v-if="label" class="skeleton-label">{{ label }}</span>
  </div>
</template>

<style scoped>
.skeleton { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-height: 110px; color: var(--text-3); }
.skeleton-chart { display: flex; align-items: flex-end; gap: 8px; height: 64px; width: 150px; }
.skeleton-bar { flex: 1; border-radius: 4px; background: #dfe3e9; position: relative; overflow: hidden; }
.theme-dark .skeleton-bar { background: #182238; }
.skeleton-bar::after, .skeleton-line::after {
  content: ''; position: absolute; inset: 0; transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--bg) 55%, transparent), transparent);
  animation: skeleton-shimmer 1.4s ease infinite;
}
.skeleton-line { position: relative; width: 120px; height: 18px; border-radius: 5px; background: #dfe3e9; overflow: hidden; }
.theme-dark .skeleton-line { background: #182238; }
.skeleton-label { font-size: 12px; }
.is-compact { min-height: 0; height: 100%; }
@keyframes skeleton-shimmer { to { transform: translateX(100%); } }
@media (prefers-reduced-motion: reduce) { .skeleton-bar::after, .skeleton-line::after { animation: none; } }
</style>
