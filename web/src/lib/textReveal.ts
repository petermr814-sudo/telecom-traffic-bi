import type { Directive } from 'vue'

// 文字逐字浮现：文本节点按字符拆成 span，每个字符从高斯模糊在极短时长内变清晰，
// 字符间依次错开。动画结束或任何中断都会把字符合并回原文本节点——Vue 的文本插值
// 引用始终有效，reduced-motion 下直接呈现最终值。

export interface TextRevealOptions {
  /** 递归处理整个子树（列表数据变动）；默认仅元素自身的直接文本节点 */
  deep?: boolean
  /** deep 模式下跳过表头（thead）内的文本 */
  skipHead?: boolean
  /** 高斯模糊起点（px） */
  blur?: number
  /** 相邻字符错开间隔（ms） */
  charStep?: number
  /** 单字符模糊时长（ms） */
  charBlur?: number
  /** 字符延迟上限（ms） */
  maxDelay?: number
  /** 超过此长度的文本跳过逐字 */
  maxChars?: number
}

export interface TextAnim {
  promise: Promise<void>
  cancel: () => void
}

const DEFAULTS: Required<TextRevealOptions> = {
  deep: false, skipHead: false, blur: 8, charStep: 14, charBlur: 90, maxDelay: 300, maxChars: 48,
}

export function animateTexts(root: HTMLElement, options: TextRevealOptions = {}): TextAnim {
  const o = { ...DEFAULTS, ...options }
  const targets: { node: Text; spans: HTMLSpanElement[] }[] = []
  const animations: Animation[] = []
  const restore = () => {
    for (const target of targets.splice(0)) {
      target.spans.forEach(span => span.remove())
      // Vue 可能已把新值写入空文本节点，此时保留新值；否则用字符拼接还原
      if (target.node.nodeValue === '') target.node.nodeValue = target.spans.map(span => span.textContent).join('')
    }
  }
  const cancel = () => {
    animations.splice(0).forEach(animation => animation.cancel())
    restore()
  }
  const nodes: Text[] = []
  if (o.deep) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (o.skipHead && (node.parentElement as HTMLElement | null)?.closest('thead')) continue
      nodes.push(node as Text)
    }
  } else {
    for (const child of root.childNodes) if (child.nodeType === Node.TEXT_NODE) nodes.push(child as Text)
  }
  let index = 0
  for (const node of nodes) {
    const value = node.nodeValue
    if (!value || !value.trim() || Array.from(value).length > o.maxChars) continue
    const units = Array.from(value)
    const spans = units.map(char => {
      const span = document.createElement('span')
      span.textContent = char
      span.style.whiteSpace = 'pre'
      span.dataset.textRevealChar = ''
      return span
    })
    node.nodeValue = ''
    const fragment = document.createDocumentFragment()
    spans.forEach(span => fragment.appendChild(span))
    node.parentNode?.insertBefore(fragment, node)
    targets.push({ node, spans })
    for (const span of spans) {
      animations.push(span.animate(
        [
          { opacity: 0, filter: `blur(${o.blur}px)` },
          { opacity: 1, filter: 'blur(0px)' },
        ],
        { duration: o.charBlur, delay: Math.min(index * o.charStep, o.maxDelay), easing: 'ease-out', fill: 'backwards' },
      ))
      index++
    }
  }
  if (!targets.length) return { promise: Promise.resolve(), cancel }
  const promise = Promise.all(animations.map(animation => animation.finished.catch(() => {}))).then(() => restore())
  return { promise, cancel }
}

interface RevealState {
  anim: TextAnim | null
  media: MediaQueryList
  finish: () => void
  onVisibility: () => void
  replay: (event: Event) => void
  frame: number
}
const states = new WeakMap<HTMLElement, RevealState>()

function reveal(root: HTMLElement) {
  const state = states.get(root)
  if (!state) return
  state.finish()
  if (state.media.matches || document.hidden) return
  root.dataset.textReveal = 'morphing'
  const anim = animateTexts(root)
  state.anim = anim
  anim.promise.then(() => {
    if (states.get(root) === state && state.anim === anim) state.finish()
  })
}

export const vTextReveal: Directive<HTMLElement, boolean | undefined> = {
  mounted(root, binding) {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const finish = () => {
      const state = states.get(root)
      if (!state) return
      state.anim?.cancel()
      state.anim = null
      root.dataset.textReveal = 'ready'
    }
    const onVisibility = () => { if (document.hidden) finish() }
    const replay = (event: Event) => reveal(root)
    states.set(root, { anim: null, media, finish, onVisibility, replay, frame: 0 })
    media.addEventListener('change', finish)
    document.addEventListener('visibilitychange', onVisibility)
    root.addEventListener('text:replay', replay)
    if (binding.value !== false) states.get(root)!.frame = requestAnimationFrame(() => reveal(root))
  },
  updated(root, binding) {
    if (binding.value && binding.oldValue === false) reveal(root)
  },
  beforeUnmount(root) {
    const state = states.get(root)
    if (!state) return
    state.finish()
    cancelAnimationFrame(state.frame)
    state.media.removeEventListener('change', state.finish)
    document.removeEventListener('visibilitychange', state.onVisibility)
    root.removeEventListener('text:replay', state.replay)
    states.delete(root)
  },
}
