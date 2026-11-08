import type { CellRow, ProvinceRow } from '@/api/types'

export type MapMetric = 'traffic' | 'users' | 'perUser' | 'growth'
export interface CityTraffic {
  name: string
  province: string
  region: string
  traffic: number
  users: number
  perUser: number
  utilization: number
  fiveGShare: number
  congested: number
  warning: number
  trend: number[]
  cells: CellRow[]
}

// City values describe the available monitored cells, not province-wide totals.
export function aggregateCities(rows: CellRow[]): CityTraffic[] {
  const groups = new Map<string, CellRow[]>()
  for (const row of rows) {
    const key = `${row.province}/${row.city}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups.values()].map(cells => {
    const traffic = cells.reduce((sum, c) => sum + c.traffic, 0)
    const users = cells.reduce((sum, c) => sum + c.users, 0)
    const capacity = cells.reduce((sum, c) => sum + c.bandwidthMbps, 0)
    return {
      name: cells[0].city, province: cells[0].province, region: cells[0].region,
      traffic, users, perUser: users ? traffic / users : 0,
      utilization: capacity ? cells.reduce((sum, c) => sum + c.util * c.bandwidthMbps, 0) / capacity : 0,
      fiveGShare: traffic ? cells.filter(c => c.generation === '5G').reduce((sum, c) => sum + c.traffic, 0) / traffic * 100 : 0,
      congested: cells.filter(c => c.status === '拥塞').length,
      warning: cells.filter(c => c.status === '预警').length,
      trend: Array.from({ length: 7 }, (_, i) => capacity ? cells.reduce((sum, c) => sum + (c.trend[i] ?? 0) * c.bandwidthMbps, 0) / capacity : 0),
      cells: [...cells].sort((a, b) => b.traffic - a.traffic)
    }
  }).sort((a, b) => b.traffic - a.traffic)
}

export function provinceMetric(row: ProvinceRow, metric: MapMetric) {
  return metric === 'traffic' ? row.trafficBytes : metric === 'perUser' ? row.perUserBytes : row[metric]
}

export function cityMetric(city: CityTraffic, metric: MapMetric, provinces: ProvinceRow[]) {
  return metric === 'growth' ? provinces.find(p => p.province === city.province)?.growth ?? 0 : city[metric]
}
