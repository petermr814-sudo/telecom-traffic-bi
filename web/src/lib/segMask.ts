import type { Directive } from 'vue'

// 分段控件（.seg）的滑动胶囊遮罩：点击切换时，白色胶囊从当前项补间滑到
// 新选中项，缓动为二次 easeInOutQuad（300ms），与日期遮罩、指标胶囊同一套。
// 用 MutationObserver 监听 is-active 类变化来驱动，天然避开 watcher 先于
// DOM 更新的竞态。不跟随系统的「减少动画」偏好，保证切换时必然可见滑动。
const quadEaseInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2)

interface SegMaskState {
  observer: MutationObserver
  onResize: () => void
  raf: number
}

export const vSegMask: Directive<HTMLElement, void> = {
  mounted(el) {
    if (el.classList.contains('has-seg-mask')) return
    const mask = document.createElement('span')
    mask.className = 'seg-mask'
    mask.setAttribute('aria-hidden', 'true')
    el.prepend(mask)
    el.classList.add('has-seg-mask')

    let raf = 0
    let inited = false
    const target = () => {
      const active = el.querySelector<HTMLElement>('.seg__item.is-active')
      return active ? { left: active.offsetLeft, width: active.offsetWidth } : null
    }
    const move = () => {
      const t = target()
      if (!t) return
      const current = inited ? { left: parseFloat(mask.style.left) || 0, width: parseFloat(mask.style.width) || 0 } : null
      cancelAnimationFrame(raf)
      if (!current) {
        mask.style.left = `${t.left}px`
        mask.style.width = `${t.width}px`
        inited = true
        return
      }
      // 目标与当前位置一致（如徽标数字刷新）时不做空转补间
      if (Math.abs(current.left - t.left) < 1 && Math.abs(current.width - t.width) < 1) return
      const from = current
      const start = performance.now()
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / 300)
        const eased = quadEaseInOut(p)
        mask.style.left = `${from.left + (t.left - from.left) * eased}px`
        mask.style.width = `${from.width + (t.width - from.width) * eased}px`
        if (p < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }
    const observer = new MutationObserver(() => move())
    observer.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
    const onResize = () => move()
    window.addEventListener('resize', onResize)
    move()
    ;(el as HTMLElement & { __segMask?: SegMaskState }).__segMask = { observer, onResize, raf }
  },
  unmounted(el) {
    const state = (el as HTMLElement & { __segMask?: SegMaskState }).__segMask
    if (state) {
      state.observer.disconnect()
      window.removeEventListener('resize', state.onResize)
      cancelAnimationFrame(state.raf)
    }
  },
}
