import type { Directive } from 'vue'
import { animateTexts, type TextAnim } from './textReveal'

// 列表数据变动动画：内容变化时容器先极速高斯模糊退场，再逐字浮现进场。
// 挂在排序 / 筛选 / 刷新会改变内容的表格容器上；MutationObserver 检测内容变动，
// 防抖合并 Vue 的批量更新；动画期间的新变化立即取消旧动画，从最新内容重新开始。
interface SwapState {
  observer: MutationObserver
  timer: number
  fadeTimer: number
  busy: boolean
  media: MediaQueryList
  anim: TextAnim | null
  lastText: string
}
const states = new WeakMap<HTMLElement, SwapState>()

const FADE_MS = 100 // 退场模糊时长（极速）
const DEBOUNCE_MS = 40

export const vSwapReveal: Directive<HTMLElement, void> = {
  mounted(root) {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const swap = () => {
      const state = states.get(root)
      if (!state) return
      if (state.media.matches || document.hidden) return
      state.busy = true
      root.classList.add('swap-fade')
      state.fadeTimer = window.setTimeout(() => {
        root.classList.remove('swap-fade')
        const anim = animateTexts(root, { deep: true, skipHead: true })
        state.anim = anim
        anim.promise.finally(() => {
          if (states.get(root) === state && state.anim === anim) {
            state.anim = null
            state.busy = false
          }
        })
      }, FADE_MS)
    }
    const state: SwapState = { observer: null as unknown as MutationObserver, timer: 0, fadeTimer: 0, busy: false, media, anim: null, lastText: root.textContent ?? '' }
    const onChange = () => {
      // 拆字与还原不改 textContent，仅真实数据变化才触发动画
      const text = root.textContent ?? ''
      if (text === state.lastText) return
      state.lastText = text
      // 接受新变化：取消进行中的退场/逐字，从最新内容重新开始
      window.clearTimeout(state.timer)
      window.clearTimeout(state.fadeTimer)
      state.anim?.cancel()
      state.anim = null
      state.busy = false
      root.classList.remove('swap-fade')
      state.timer = window.setTimeout(swap, DEBOUNCE_MS)
    }
    state.observer = new MutationObserver(onChange)
    state.observer.observe(root, { childList: true, subtree: true, characterData: true })
    states.set(root, state)
  },
  unmounted(root) {
    const state = states.get(root)
    if (!state) return
    state.observer.disconnect()
    window.clearTimeout(state.timer)
    window.clearTimeout(state.fadeTimer)
    state.anim?.cancel()
    root.classList.remove('swap-fade')
    states.delete(root)
  },
}
