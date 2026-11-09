<script setup lang="ts">
import { ref } from 'vue'
import Icon from './Icon.vue'

defineProps<{ title: string; sub?: string }>()

// 展开/收起用明确 px 高度过渡（0fr 行高技巧在 auto 高度容器里解析为 max-content，
// 收起方向值不变不触发过渡）。visibility 由 CSS transition-delay 在收起结束后置 hidden，
// 保证收起态内容不可聚焦、对辅助技术隐藏。
const inner = ref<HTMLElement>()
let settleTimer = 0
function onToggle(event: Event) {
  const next = (event.target as HTMLDetailsElement).open
  window.clearTimeout(settleTimer)
  const el = inner.value
  if (!el) return
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.style.height = next ? 'auto' : '0px'
    return
  }
  const current = el.getBoundingClientRect().height
  el.style.height = `${current}px`
  void el.offsetHeight
  el.style.height = next ? `${el.scrollHeight}px` : '0px'
  if (next) settleTimer = window.setTimeout(() => { el.style.height = 'auto' }, 380)
}
</script>

<template>
  <details class="disclosure" @toggle="onToggle">
    <summary>
      <div><strong>{{ title }}</strong><span v-if="sub">{{ sub }}</span></div>
      <Icon name="chevron-down" :size="18" />
    </summary>
    <div class="disclosure-content">
      <div ref="inner" class="disclosure-inner" style="height: 0px"><slot /></div>
    </div>
  </details>
</template>

<style scoped>
.disclosure { border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); min-width: 0; }
summary { list-style: none; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 24px; cursor: pointer; }
summary::-webkit-details-marker { display: none; }
summary strong { display: block; font-size: 14px; font-weight: 600; }
summary span { display: block; margin-top: 4px; color: var(--text-3); font-size: 12px; }
summary > svg { color: var(--text-3); flex-shrink: 0; transition: transform 240ms ease-out; }
details[open] > summary > svg { transform: rotate(180deg); }
summary:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
/* 覆盖 UA 样式 details:not([open]) > :not(summary) { display:none }：内容常驻 DOM，
   收起态由 inner 的 px 高度动画控制；visibility 延迟到动画结束后再隐藏 */
.disclosure-content { display: block; opacity: 0; visibility: hidden; pointer-events: none; transition: opacity 240ms ease, visibility 0s 380ms; }
details[open] .disclosure-content { opacity: 1; visibility: visible; pointer-events: auto; transition: opacity 240ms ease, visibility 0s 0s; }
.disclosure-inner { overflow: hidden; padding: 0 24px 24px; transition: height 320ms cubic-bezier(.4, 0, .2, 1); }
@media (prefers-reduced-motion: reduce) { .disclosure-content, .disclosure-inner { transition: none; } }
@media (max-width: 680px) { summary { padding: 18px; } .disclosure-inner { padding: 0 16px 16px; } }
</style>
