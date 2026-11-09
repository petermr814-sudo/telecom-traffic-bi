<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import Icon from './Icon.vue'

defineProps<{ title: string; sub?: string }>()

// 不依赖 <details> 的原生开合：原生 toggle 发生在内容隐藏之后，浏览器会冻结
// 内部的高度/透明度过渡，导致收起没有动画、再次展开从错误高度开始。
// 这里自己维护开合状态：动画期间保持 details open，结束后再同步 open 属性。
const root = ref<HTMLDetailsElement>()
const inner = ref<HTMLElement>()
const open = ref(false)
// 收起动画结束后再真正隐藏内容；details 关闭后浏览器会冻结内部过渡，
// 单靠 CSS visibility 延迟会停留在 visible。
const settled = ref(true)
let animation: Animation | null = null

function toggle() {
  const details = root.value
  const el = inner.value
  if (!details || !el) return

  const next = !open.value
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const start = el.getBoundingClientRect().height

  animation?.cancel()
  animation = null
  settled.value = false
  // 动画期间必须保持 details 处于打开状态，否则内容不会被渲染，过渡会停在半路
  details.open = true
  open.value = next

  if (reduce) {
    el.style.height = next ? 'auto' : '0px'
    if (!next) {
      settled.value = true
      details.open = false
    }
    return
  }

  el.style.height = `${start}px`
  void el.offsetHeight
  const end = next ? el.scrollHeight : 0
  const anim = el.animate(
    [{ height: `${start}px` }, { height: `${end}px` }],
    {
      duration: next ? 360 : 300,
      easing: next ? 'cubic-bezier(0.22, 0.68, 0, 1)' : 'cubic-bezier(0.4, 0, 0.2, 1)',
      fill: 'both'
    }
  )
  animation = anim
  anim.onfinish = () => {
    el.style.height = next ? 'auto' : '0px'
    anim.cancel()
    if (animation === anim) animation = null
    if (!next) {
      settled.value = true
      details.open = false
    }
  }
}

onBeforeUnmount(() => {
  animation?.cancel()
  animation = null
})
</script>

<template>
  <details ref="root" class="disclosure" :class="{ 'is-open': open, 'is-hidden': settled }">
    <summary :aria-expanded="open" @click.prevent="toggle">
      <div><strong>{{ title }}</strong><span v-if="sub">{{ sub }}</span></div>
      <Icon name="chevron-down" :size="18" />
    </summary>
    <div class="disclosure-content">
      <div ref="inner" class="disclosure-inner" style="height: 0px">
        <div class="disclosure-pad"><slot /></div>
      </div>
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
.disclosure.is-open > summary > svg { transform: rotate(180deg); }
summary:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
/* 覆盖 UA 样式 details:not([open]) > :not(summary) { display:none }：内容常驻 DOM，
   收起态由 inner 的 px 高度动画控制；visibility 延迟到动画结束后再隐藏 */
.disclosure-content { display: block; opacity: 0; visibility: hidden; pointer-events: none; transition: opacity 200ms ease, visibility 0s 320ms; }
.disclosure.is-open .disclosure-content { opacity: 1; visibility: visible; pointer-events: auto; transition: opacity 200ms ease, visibility 0s 0s; }
/* 收起动画结束后由 is-hidden 立即隐藏内容，避免 details 关闭后过渡被冻结 */
.disclosure.is-hidden .disclosure-content { visibility: hidden; transition: none; }
.disclosure-inner { overflow: hidden; }
.disclosure-pad { padding: 0 24px 24px; }
@media (prefers-reduced-motion: reduce) { .disclosure-content { transition: none; } }
@media (max-width: 680px) { summary { padding: 18px; } .disclosure-pad { padding: 0 16px 16px; } }
</style>
