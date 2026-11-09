import type { Directive } from 'vue'

type RevealState = { animations: Animation[]; media: MediaQueryList; finish: () => void; replay: () => void; frame: number; observer: ResizeObserver }
const states = new WeakMap<HTMLElement, RevealState>()

/** Animate live DOM/SVG nodes; cancelling always exposes the current Vue-rendered value. */
export const vLiquid: Directive<HTMLElement, boolean | undefined> = {
  mounted(root, binding) {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const finish = () => {
      const state = states.get(root)
      state?.animations.splice(0).forEach(animation => animation.cancel())
      root.dataset.liquidReveal = 'ready'
    }
    let size = `${root.clientWidth}:${root.clientHeight}`
    const observer = new ResizeObserver(() => {
      const next = `${root.clientWidth}:${root.clientHeight}`
      if (next !== size) finish()
      size = next
    })
    const replay = () => reveal(root)
    states.set(root, { animations: [], media, finish, replay, frame: 0, observer })
    media.addEventListener('change', finish)
    document.addEventListener('visibilitychange', finish)
    root.addEventListener('liquid:replay', replay)
    observer.observe(root)
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
    state.observer.disconnect()
    state.media.removeEventListener('change', state.finish)
    document.removeEventListener('visibilitychange', state.finish)
    root.removeEventListener('liquid:replay', state.replay)
    states.delete(root)
  },
}

function reveal(root: HTMLElement) {
  const state = states.get(root)
  if (!state) return
  state.finish()
  const bounds = root.getBoundingClientRect()
  if (state.media.matches || document.hidden || bounds.top > innerHeight || bounds.bottom < 0) return
  root.dataset.liquidReveal = 'morphing'
  const svg = root instanceof SVGElement ? root : root.querySelector('svg[data-liquid-svg]')
  const marks = svg ? [...svg.querySelectorAll('circle, line, rect, path')] : []
  const nodes: Element[] = marks.length ? marks : [root]
  for (const [index, node] of nodes.entries()) {
    const box = node.getBoundingClientRect()
    const cx = bounds.x + bounds.width * .5, cy = bounds.y + bounds.height * .45
    const dx = cx - box.x - box.width / 2, dy = cy - box.y - box.height / 2
    const animation = node.animate(marks.length ? [
      { transform: `translate(${dx}px, ${dy}px) scale(.8)`, opacity: .7, filter: 'blur(1.4px)' },
      { transform: 'translate(0px, 0px) scale(1)', opacity: 1, filter: 'blur(0px)' },
    ] : [
      { clipPath: 'ellipse(6% 20% at 50% 55%)', filter: 'blur(5px)', opacity: .35 },
      { clipPath: 'ellipse(42% 90% at 50% 50%)', filter: 'blur(2px)', opacity: 1, offset: .55 },
      { clipPath: 'ellipse(75% 150% at 50% 50%)', filter: 'blur(0px)', opacity: 1 },
    ], { duration: marks.length ? 700 : 620, delay: marks.length ? index % 12 * 5 : 0, easing: 'cubic-bezier(.65, 0, .25, 1)', fill: 'backwards' })
    state.animations.push(animation)
  }
  Promise.all(state.animations.map(animation => animation.finished.catch(() => {}))).then(() => {
    if (states.get(root) === state && state.animations.every(a => a.playState !== 'running')) state.finish()
  })
}
