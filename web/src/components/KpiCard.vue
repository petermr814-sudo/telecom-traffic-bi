<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import SkeletonLoader from './SkeletonLoader.vue'
import { fmtDelta } from '@/lib/format'

const props = withDefaults(defineProps<{
  label: string
  value: string
  unit?: string
  delta?: number
  deltaLabel?: string
  icon?: string
  tone?: 'blue' | 'teal' | 'violet' | 'amber' | 'red'
  hint?: string
  positiveIsGood?: boolean
  loading?: boolean
}>(), {
  unit: '', deltaLabel: '较上期', icon: 'activity', tone: 'blue', hint: '', positiveIsGood: true
})
const good = computed(() => props.delta === undefined || props.delta === 0 ? null : (props.delta > 0) === props.positiveIsGood)
</script>

<template>
  <article class="kpi" :aria-busy="loading">
    <div class="kpi-head"><span class="kpi-label">{{ label }}</span><Icon :name="icon" :size="18" /></div>
    <div class="kpi-value"><Transition name="skeleton-fade" :duration="250"><SkeletonLoader v-if="loading" variant="line" compact /><span v-else class="kpi-value-fill"><span v-text-reveal="!loading" class="num">{{ value }}</span><span v-if="unit" class="kpi-unit">{{ unit }}</span></span></Transition></div>
    <div class="kpi-foot">
      <span v-if="delta !== undefined" class="delta" :class="good === null ? 'delta--flat' : good ? 'delta--up' : 'delta--down'">
        <Icon :name="delta >= 0 ? 'arrow-up' : 'arrow-down'" :size="12" />{{ fmtDelta(Math.abs(delta)) }}
      </span>
      <span>{{ deltaLabel }}</span><span v-if="hint" class="kpi-extra">{{ hint }}</span>
    </div>
  </article>
</template>

<style scoped>
.kpi { min-width: 0; padding: 24px 26px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
.kpi-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--text-3); }
.kpi-label { color: var(--text-2); font-size: 13px; }
.kpi-value { display: flex; align-items: baseline; gap: 8px; margin-top: 18px; line-height: 1.1; min-height: 46.2px; }
.kpi-value .num { font-size: clamp(30px, 2.8vw, 42px); font-weight: 650; letter-spacing: -.045em; }
.kpi-unit { font-size: 14px; color: var(--text-3); }
.skeleton-fade-leave-active { transition: opacity .25s ease; }
.skeleton-fade-leave-to { opacity: 0; }
.kpi-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin-top: 16px; font-size: 12px; color: var(--text-3); }
.kpi-extra { margin-left: auto; }
@media (max-width: 680px) { .kpi { padding: 20px; } .kpi-value .num { font-size: 30px; } }
</style>
