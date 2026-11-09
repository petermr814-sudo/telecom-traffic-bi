import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'
import { vTextReveal } from './lib/textReveal'
import { vSwapReveal } from './lib/swapReveal'
import { vTypeReveal } from './lib/typeReveal'
import { vSegMask } from './lib/segMask'

createApp(App)
  .directive('text-reveal', vTextReveal)
  .directive('swap-reveal', vSwapReveal)
  .directive('type-reveal', vTypeReveal)
  .directive('seg-mask', vSegMask)
  .use(router)
  .mount('#app')

// MiSans 按 unicode-range 分片加载。CSS 里的字体替换会自动作用到 DOM，
// 但 ECharts 的 canvas 文本只在绘制时读字体，分片到位后需要重新排版一次。
// ResizeObserver 只跟踪容器尺寸，字体加载不会触发它，所以这里显式 resize。
const redrawCharts = () => {
  document.querySelectorAll<HTMLElement>('.chart-surface').forEach((el) => {
    ;(el as any).__chart?.resize()
  })
}

if (document.fonts) {
  let fontFrame = 0
  const scheduleRedraw = () => {
    cancelAnimationFrame(fontFrame)
    fontFrame = requestAnimationFrame(redrawCharts)
  }
  void document.fonts.ready.then(scheduleRedraw)
  document.fonts.addEventListener('loadingdone', scheduleRedraw)
}
