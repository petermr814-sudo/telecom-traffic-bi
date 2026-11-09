import type { Directive } from 'vue'
import { animateTexts, type TextAnim } from './textReveal'

// 搜索框输入逐字：文字渲染在覆盖层上，每个新输入的字符极速高斯模糊浮现；
// input 文字透明但光标保留，输入法组合期间暂停动画。
interface TypeState {
  wrap: HTMLElement
  text: HTMLElement
  anim: TextAnim | null
  composing: boolean
  media: MediaQueryList
}
const states = new WeakMap<HTMLInputElement, TypeState>()

export const vTypeReveal: Directive<HTMLInputElement, void> = {
  mounted(el) {
    if (el.dataset.typeReveal) return
    el.dataset.typeReveal = ''
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const wrap = document.createElement('span')
    wrap.className = 'type-reveal'
    el.parentNode?.insertBefore(wrap, el)
    wrap.appendChild(el)
    const text = document.createElement('span')
    text.className = 'type-reveal__text'
    text.setAttribute('aria-hidden', 'true')
    wrap.appendChild(text)
    el.classList.add('type-reveal__input')
    // 覆盖层对齐 input 的文字起点（border + padding）与字体
    const cs = getComputedStyle(el)
    text.style.left = `${parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft)}px`
    text.style.top = `${parseFloat(cs.borderTopWidth)}px`
    text.style.font = cs.font
    text.style.letterSpacing = cs.letterSpacing
    text.style.color = cs.color
    const state: TypeState = { wrap, text, anim: null, composing: false, media }
    const sync = () => {
      if (state.media.matches) return
      state.anim?.cancel()
      text.textContent = el.value
      state.anim = el.value ? animateTexts(text) : null
    }
    el.addEventListener('compositionstart', () => { state.composing = true })
    el.addEventListener('compositionend', () => { state.composing = false; sync() })
    el.addEventListener('input', () => { if (!state.composing) sync() })
    sync()
    states.set(el, state)
  },
  unmounted(el) {
    const state = states.get(el)
    if (!state) return
    state.anim?.cancel()
    state.wrap.parentNode?.insertBefore(el, state.wrap)
    state.wrap.remove()
    el.classList.remove('type-reveal__input')
    states.delete(el)
  },
}
