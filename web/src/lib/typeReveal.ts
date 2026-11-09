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
  shown: string
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
    // 覆盖层对齐 input 的文字起点（border + padding）与字体。
    // 必须在加透明类之前完成取色：透明类把 input 文字变成 transparent，
    // 而 getComputedStyle 返回活对象，加类后再读会把透明色抄给覆盖层，文字就看不见了。
    const cs = getComputedStyle(el)
    text.style.left = `${parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft)}px`
    text.style.top = `${parseFloat(cs.borderTopWidth)}px`
    text.style.font = cs.font
    text.style.letterSpacing = cs.letterSpacing
    text.style.color = cs.color
    el.classList.add('type-reveal__input')
    const state: TypeState = { wrap, text, anim: null, composing: false, media, shown: '' }
    const sync = () => {
      state.anim?.cancel()
      const value = el.value
      // 减少动态效果：直接呈现纯文字（镜像必须更新，否则透明 input 下文字不可见）
      if (state.media.matches) {
        text.textContent = value
        state.shown = value
        return
      }
      // 仅新增字符逐字浮现，已有文字保持不动；删除/改写不播动画，直接落定
      const prev = state.shown
      if (prev && value.startsWith(prev) && value.length > prev.length) {
        text.textContent = prev
        const holder = document.createElement('span')
        holder.textContent = value.slice(prev.length)
        text.appendChild(holder)
        state.anim = animateTexts(holder)
      } else if (!prev && value) {
        text.textContent = value
        state.anim = animateTexts(text)
      } else {
        text.textContent = value
        state.anim = null
      }
      state.shown = value
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
