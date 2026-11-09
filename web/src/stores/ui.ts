import { computed, reactive } from 'vue'
import type { CellRow, RangeKey, RegionKey } from '@/api/types'

export interface Toast {
  id: number
  type: 'success' | 'info' | 'warn' | 'error'
  title: string
  desc?: string
}

interface Settings {
  warn: number
  congest: number
  autoRefresh: number
}

function readSettings(): Settings {
  try {
    const raw = localStorage.getItem('telco.settings')
    if (raw) {
      const s = JSON.parse(raw)
      return { warn: s.warn ?? 70, congest: s.congest ?? 85, autoRefresh: s.autoRefresh ?? 0 }
    }
  } catch {
    /* ignore */
  }
  return { warn: 70, congest: 85, autoRefresh: 0 }
}

let toastId = 0

export const ui = reactive({
  range: 'today' as RangeKey,
  region: 'all' as RegionKey,
  compare: true,
  tick: 0,
  loadingCount: 0,
  lastUpdated: '—',
  settings: readSettings(),
  toasts: [] as Toast[],
  commandOpen: false,
  infoOpen: false,
  alertsOpen: false,
  settingsOpen: false,
  shortcutsOpen: false,
  cellDetail: null as CellRow | null
})

export const isLoading = computed(() => ui.loadingCount > 0)

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: '7d', label: '近 7 天' },
  { key: '30d', label: '近 30 天' }
]

export const REGIONS: RegionKey[] = ['all', '华北', '东北', '华东', '华中', '华南', '西南', '西北']

export function toast(type: Toast['type'], title: string, desc?: string) {
  const item: Toast = { id: ++toastId, type, title, desc }
  ui.toasts.push(item)
  window.setTimeout(() => {
    const i = ui.toasts.findIndex((t) => t.id === item.id)
    if (i >= 0) ui.toasts.splice(i, 1)
  }, 3600)
}

export function dismissToast(id: number) {
  const i = ui.toasts.findIndex((t) => t.id === id)
  if (i >= 0) ui.toasts.splice(i, 1)
}

export function setRange(range: RangeKey) {
  if (ui.range === range) return
  ui.range = range
}

export function setRegion(region: RegionKey) {
  if (ui.region === region) return
  ui.region = region
}

export function refresh() {
  ui.tick += 1
  ui.lastUpdated = new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

export function saveSettings(next: Settings) {
  ui.settings.warn = Math.min(95, Math.max(40, next.warn))
  ui.settings.congest = Math.min(99, Math.max(ui.settings.warn + 1, next.congest))
  ui.settings.autoRefresh = next.autoRefresh
  localStorage.setItem('telco.settings', JSON.stringify(ui.settings))
  toast('success', '设置已保存', `预警 ${ui.settings.warn}% · 拥塞 ${ui.settings.congest}%`)
  refresh()
}

export function downloadFile(filename: string, content: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['\ufeff' + content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c ?? '')
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(',')
    )
    .join('\n')
}
