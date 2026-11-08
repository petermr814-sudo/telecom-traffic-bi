<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import { fmtDelta } from '@/lib/format'

const props = withDefaults(defineProps<{
  label: string
  value: string
  unit?: string
  delta?: number
  deltaLabel?: string
  icon?: string
  tone?: 'blue' | 'teal' | 'violet' | 'amber' | 'red'
  spark?: number[]
  hint?: string
  positiveIsGood?: boolean
}>(), {
  unit: '',
  delta: 0,
  deltaLabel: '较上期',
  icon: 'activity',
  tone: 'blue',
  spark: () => [],
  hint: '',
  positiveIsGood: true
})

const gid = `g${Math.random().toString(36).slice(2, 8)}`

const good = computed(() => (props.delta === 0 ? null : (props.delta > 0) === props.positiveIsGood))

const points = computed(() => {
  const data = props.spark
  if (data.length < 2) return ''
  const max = Math.max(...data)
  const min = Math.min(...data)
  const span = max - min || 1
  return data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * 120
      const y = 30 - ((v - min) / span) * 24
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
})

const area = computed(() => (points.value ? `0,34 ${points.value} 120,34` : ''))
</script>

<template>
  <article class="kpi" :class="`kpi--${tone}`">
    <div class="kpi-head">
      <span class="kpi-label">{{ label }}</span>
      <span class="kpi-icon"><Icon :name="icon" :size="15" /></span>
    </div>
    <div class="kpi-value">
      <span class="num">{{ value }}</span>
      <span v-if="unit" class="kpi-unit">{{ unit }}</span>
    </div>
    <div class="kpi-foot">
      <span class="delta" :class="good === null ? 'delta--flat' : good ? 'delta--up' : 'delta--down'">
        <Icon :name="delta >= 0 ? 'arrow-up' : 'arrow-down'" :size="12" :stroke-width="2" />
        {{ fmtDelta(Math.abs(delta)) }}
      </span>
      <span class="kpi-hint">{{ deltaLabel }}</span>
      <span v-if="hint" class="kpi-extra">{{ hint }}</span>
    </div>
    <svg v-if="spark.length > 1" class="spark" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient :id="gid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="currentColor" stop-opacity="0.18" />
          <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
        </linearGradient>
      </defs>
      <polygon :points="area" :fill="`url(#${gid})`" />
      <polyline :points="points" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" />
    </svg>
  </article>
</template>

<style scoped>
.kpi {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px 12px;
  min-width: 0;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.kpi:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px) scale(1.01);
}

.kpi-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.kpi-label {
  font-size: 12px;
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kpi-icon {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: var(--primary-soft);
  color: var(--primary);
}

.kpi-value {
  display: flex;
  align-items: baseline;
  gap: 5px;
  margin-top: 7px;
  line-height: 1.1;
}

.kpi-value .num {
  font-size: 27px;
  font-weight: 650;
  letter-spacing: -0.035em;
}

.kpi-unit {
  font-size: 12px;
  color: var(--text-3);
  font-weight: 500;
}

.kpi-foot {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-3);
  position: relative;
  z-index: 1;
}

.kpi-hint {
  white-space: nowrap;
}

.kpi-extra {
  margin-left: auto;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-size: 10px;
  color: var(--text-3);
  white-space: nowrap;
}

.spark {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 118px;
  height: 34px;
  color: var(--primary);
  opacity: 0.85;
  pointer-events: none;
}

.kpi--teal .kpi-icon {
  background: var(--cyan-soft);
  color: var(--cyan);
}

.kpi--teal .spark {
  color: var(--cyan);
}

.kpi--violet .kpi-icon {
  background: var(--violet-soft);
  color: var(--violet);
}

.kpi--violet .spark {
  color: var(--violet);
}

.kpi--amber .kpi-icon {
  background: var(--amber-soft);
  color: var(--amber);
}

.kpi--amber .spark {
  color: var(--amber);
}

.kpi--red .kpi-icon {
  background: var(--red-soft);
  color: var(--red);
}

.kpi--red .spark {
  color: var(--red);
}

@media (max-width: 1360px) {
  .kpi-value .num {
    font-size: 24px;
  }

  .spark {
    width: 90px;
    opacity: 0.6;
  }
}
</style>
