<script setup lang="ts">
// G7 Tree LR layout adapted to the actual five-stage linear pipeline.
import type { PipelineStage } from '@/api/types'
import Icon from './Icon.vue'
defineProps<{ stages: PipelineStage[] }>()
</script>

<template>
  <ol class="process-flow" data-template="G7" aria-label="数据处理阶段">
    <li v-for="(stage, index) in stages" :key="stage.name">
      <div class="flow-head"><span class="flow-node" :title="stage.status">{{ String(index + 1).padStart(2, '0') }}</span><span v-if="index < stages.length - 1" class="flow-link"><Icon name="chevron-right" :size="13" /></span></div>
      <div class="flow-copy"><strong>{{ stage.name }}</strong><span>{{ stage.detail }}</span><b class="num">{{ stage.metric }}</b></div>
    </li>
  </ol>
</template>

<style scoped>
.process-flow { display: flex; gap: 18px; padding: 4px 0 8px; }
li { flex: 1; min-width: 0; }
.flow-head { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.flow-node { width: 34px; height: 34px; flex-shrink: 0; display: grid; place-items: center; border: 1px solid var(--primary-border); border-radius: 50%; background: var(--primary-soft); color: var(--primary); font: 600 11px var(--mono); }
.flow-link { flex: 1; height: 1px; position: relative; background: var(--border-strong); color: var(--text-3); }
.flow-link svg { position: absolute; right: -2px; top: -6px; background: var(--surface); }
.flow-copy strong { display: block; font-size: 14px; }
.flow-copy > span { display: block; margin-top: 7px; color: var(--text-3); font-size: 11px; line-height: 1.6; }
.flow-copy b { display: block; margin-top: 16px; color: var(--primary); font-size: 15px; font-weight: 600; }
@media (max-width: 760px) {
  .process-flow { flex-direction: column; gap: 22px; }
  li { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 18px; position: relative; }
  li:not(:last-child)::after { content: ''; position: absolute; left: 17px; top: 42px; bottom: -16px; width: 1px; background: var(--border-strong); }
  .flow-head { margin-bottom: 0; align-self: start; }
  .flow-link { display: none; }
  .flow-copy b { margin-top: 8px; }
}
</style>
