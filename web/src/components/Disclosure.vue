<script setup lang="ts">
import { ref } from 'vue'
import Icon from './Icon.vue'

defineProps<{ title: string; sub?: string }>()
const open = ref(false)
</script>

<template>
  <details class="disclosure" @toggle="open = ($event.target as HTMLDetailsElement).open">
    <summary>
      <div><strong>{{ title }}</strong><span v-if="sub">{{ sub }}</span></div>
      <Icon name="chevron-down" :size="18" />
    </summary>
    <div v-if="open" class="disclosure-content"><slot /></div>
  </details>
</template>

<style scoped>
.disclosure { border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); min-width: 0; }
summary { list-style: none; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 24px; cursor: pointer; }
summary::-webkit-details-marker { display: none; }
summary strong { display: block; font-size: 14px; font-weight: 600; }
summary span { display: block; margin-top: 4px; color: var(--text-3); font-size: 12px; }
summary > svg { color: var(--text-3); flex-shrink: 0; transition: transform 180ms ease-out; }
details[open] > summary > svg { transform: rotate(180deg); }
summary:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
.disclosure-content { padding: 0 24px 24px; }
@media (max-width: 680px) { summary { padding: 18px; } .disclosure-content { padding: 0 16px 16px; } }
</style>
