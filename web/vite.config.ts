import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_API_BASE || ''

  return {
    base: './',
    plugins: [vue()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
    },
    server: {
      port: 5178,
      host: '127.0.0.1',
      proxy: target ? { '/api': { target, changeOrigin: true } } : undefined
    },
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 1600
    }
  }
})
