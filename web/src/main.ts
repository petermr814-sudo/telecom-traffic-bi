import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'
import { vTextReveal } from './lib/textReveal'
import { vSegMask } from './lib/segMask'

createApp(App).directive('text-reveal', vTextReveal).directive('seg-mask', vSegMask).use(router).mount('#app')
