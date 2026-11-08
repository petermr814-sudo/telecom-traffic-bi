import { computed, ref } from 'vue'
import { api } from '@/api/client'
import type { Alert } from '@/api/types'

/** 告警的全局状态：侧栏铃铛、告警抽屉、刷新按钮共用一份数据。 */
export const alertList = ref<Alert[]>([])
export const alertsLoading = ref(false)
export const alertsError = ref('')

const acked = new Set<string>()
let loaded = false

export const pendingAlerts = computed(() => alertList.value.filter((a) => a.status === '待处理').length)
export const alertTotal = computed(() => alertList.value.length)

function applyAcks(list: Alert[]): Alert[] {
  return list.map((a) => ({ ...a, status: acked.has(a.id) ? '已确认' : a.status }))
}

export async function loadAlerts(force = false): Promise<void> {
  if (loaded && !force) return
  alertsLoading.value = true
  alertsError.value = ''
  try {
    alertList.value = applyAcks(await api.alerts())
    loaded = true
  } catch (e) {
    alertsError.value = (e as Error).message
  } finally {
    alertsLoading.value = false
  }
}

export function syncAlerts(list: Alert[]): void {
  alertList.value = applyAcks(list)
  loaded = true
}

export function ackAlert(id: string): void {
  acked.add(id)
  const target = alertList.value.find((a) => a.id === id)
  if (target) target.status = '已确认'
}

export function ackAllAlerts(): void {
  for (const a of alertList.value) {
    a.status = '已确认'
    acked.add(a.id)
  }
}
