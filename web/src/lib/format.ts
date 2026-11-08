const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB']

export function fmtBytes(n: number, digits = 1): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  let i = 0
  let v = n
  while (v >= 1000 && i < BYTE_UNITS.length - 1) {
    v /= 1000
    i++
  }
  return `${v.toFixed(v >= 100 ? 0 : digits)} ${BYTE_UNITS[i]}`
}

export function splitBytes(n: number): { value: string; unit: string } {
  if (!Number.isFinite(n) || n <= 0) return { value: '0', unit: 'B' }
  let i = 0
  let v = n
  while (v >= 1000 && i < BYTE_UNITS.length - 1) {
    v /= 1000
    i++
  }
  return { value: v.toFixed(v >= 100 ? 0 : 1), unit: BYTE_UNITS[i] }
}

const RATE_UNITS = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps']

export function fmtRate(bps: number): string {
  let i = 0
  let v = bps
  while (v >= 1000 && i < RATE_UNITS.length - 1) {
    v /= 1000
    i++
  }
  return `${v.toFixed(v >= 100 ? 0 : 2)} ${RATE_UNITS[i]}`
}

export function splitRate(bps: number): { value: string; unit: string } {
  let i = 0
  let v = bps
  while (v >= 1000 && i < RATE_UNITS.length - 1) {
    v /= 1000
    i++
  }
  return { value: v.toFixed(v >= 100 ? 0 : 2), unit: RATE_UNITS[i] }
}

export function fmtCount(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)} 亿`
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)} 万`
  return n.toLocaleString('zh-CN')
}

export function fmtInt(n: number): string {
  return n.toLocaleString('zh-CN')
}

export function fmtPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`
}

export function fmtDelta(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
}

export function hourLabel(h: number): string {
  return `${String(h).padStart(2, '0')}:00`
}

export function todayLabel(): string {
  const d = new Date()
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

export const RANGE_LABEL: Record<string, string> = { today: '今日', '7d': '近 7 天', '30d': '近 30 天' }
