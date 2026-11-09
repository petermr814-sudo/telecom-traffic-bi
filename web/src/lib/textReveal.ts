import type { Directive } from 'vue'

// 文字逐字浮现：把元素的直接文本节点按字符拆成 span，每个字符从高斯模糊
// 在极短时长内变清晰，字符间依次错开。动画结束或任何中断都会把字符合并回
// 原文本节点——Vue 的文本插值引用始终有效，reduced-motion 下直接呈现最终值。
interface RevealState {
  animations: Animation[]
  targets: { node: Text; spans: HTMLSpanElement[] }[]
  media: MediaQueryList
  finish: () => void
  onVisibility: () => void
  replay: (event: Event) => void
  frame: number
}
const states = new WeakMap<HTMLElement, RevealState>()

const CHAR_STEP = 28 // 相邻字符错开间隔
const CHAR_BLUR = 150 // 单字符高斯模糊时长（极快）
const MAX_DELAY = 640 // 字符延迟上限，长数字不会拖太久
const MAX_CHARS = 48 // 超过此长度不做逐字，避免长文本动画过重
const BLUR_PX = 9

function reveal(root: HTMLElement) {
  const state = states.get(root)
  if (!state) return
  state.finish()
  if (state.media.matches || document.hidden) return
  root.dataset.textReveal = 'morphing'
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType !== Node.TEXT_NODE) continue
    const value = child.nodeValue
    if (!value || !value.trim()) continue
    const text = child as Text
    const units = Array.from(value)
    if (units.length > MAX_CHARS) continue
    const spans = units.map(char => {
      const span = document.createElement('span')
      span.textContent = char
      span.style.whiteSpace = 'pre'
      span.dataset.textRevealChar = ''
      return span
    })
    text.nodeValue = ''
    const fragment = document.createDocumentFragment()
    spans.forEach(span => fragment.appendChild(span))
    text.parentNode?.insertBefore(fragment, text)
    state.targets.push({ node: text, spans })
  }
  if (!state.targets.length) {
    root.dataset.textReveal = 'ready'
    return
  }
  let index = 0
  for (const target of state.targets) {
    for (const span of target.spans) {
      const animation = span.animate(
        [
          { opacity: 0, filter: `blur(${BLUR_PX}px)` },
          { opacity: 1, filter: 'blur(0px)' },
        ],
        { duration: CHAR_BLUR, delay: Math.min(index * CHAR_STEP, MAX_DELAY), easing: 'ease-out', fill: 'backwards' },
      )
      state.animations.push(animation)
      index++
    }
  }
  Promise.all(state.animations.map(animation => animation.finished.catch(() => {}))).then(() => {
    if (states.get(root) === state && state.animations.every(a => a.playState !== 'running')) state.finish()
  })
}

export const vTextReveal: Directive<HTMLElement, boolean | undefined> = {
  mounted(root, binding) {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const finish = () => {
      const state = states.get(root)
      if (!state) return
      state.animations.splice(0).forEach(animation => animation.cancel())
      for (const target of state.targets.splice(0)) {
        target.spans.forEach(span => span.remove())
        // Vue 可能已把新值写入空文本节点，此时保留新值；否则用字符拼接还原
        if (target.node.nodeValue === '') target.node.nodeValue = target.spans.map(span => span.textContent).join('')
      }
      root.dataset.textReveal = 'ready'
    }
    const onVisibility = () => { if (document.hidden) finish() }
    const replay = (event: Event) => reveal(root)
    states.set(root, { animations: [], targets: [], media, finish, onVisibility, replay, frame: 0 })
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
