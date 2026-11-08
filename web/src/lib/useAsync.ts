import { ref, watch, type Ref } from 'vue'
import { ui } from '@/stores/ui'

export function useAsync<T>(fn: () => Promise<T>, deps: () => unknown[] = () => [ui.tick]) {
  const data = ref<T | null>(null) as Ref<T | null>
  const error = ref('')
  const loading = ref(false)

  async function run() {
    loading.value = true
    ui.loadingCount++
    error.value = ''
    try {
      data.value = await fn()
      if (ui.lastUpdated === '—') {
        ui.lastUpdated = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      }
    } catch (e) {
      error.value = (e as Error).message || '加载失败'
    } finally {
      loading.value = false
      ui.loadingCount = Math.max(0, ui.loadingCount - 1)
    }
  }

  watch(deps, run, { immediate: true, deep: true })
  return { data, error, loading, run }
}
