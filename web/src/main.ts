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
