import type {
  Alert, Cell, CellRow, CellsData, Dataset, HourlyData, Job, Meta, Overview,
  Pipeline, ProvinceRow, RangeKey, RegionKey, RegionSlice
} from './types'

let cache: Promise<Dataset> | null = null

function load(): Promise<Dataset> {
  if (!cache) {
    cache = fetch(`${import.meta.env.BASE_URL}data/dataset.json`).then((r) => {
      if (!r.ok) throw new Error(`数据文件加载失败：${r.status}`)
      return r.json() as Promise<Dataset>
    })
  }
  return cache
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function toRow(c: Cell, range: RangeKey, warn: number, congest: number): CellRow {
  const util = c.utilization[range]
  const traffic = c.trafficBytes * (range === 'today' ? 1 : range === '7d' ? 7 : 30)
  return {
    ...c,
    util,
    traffic,
    status: util >= congest ? '拥塞' : util >= warn ? '预警' : '正常',
    headroomMbps: Math.round(c.bandwidthMbps * (1 - util / 100))
  }
}

function regionShares(rows: ProvinceRow[]): RegionSlice[] {
  const total = rows.reduce((s, r) => s + r.trafficBytes, 0)
  const map = new Map<string, number>()
  for (const r of rows) map.set(r.region, (map.get(r.region) ?? 0) + r.trafficBytes)
  return [...map.entries()]
    .map(([region, bytes]) => ({ region, bytes, share: (bytes / total) * 100 }))
    .sort((a, b) => b.bytes - a.bytes)
}

export const mock = {
  async meta(): Promise<Meta> {
    await sleep(80)
    return (await load()).meta
  },

  async overview(range: RangeKey, region: RegionKey, warn = 70, congest = 85): Promise<Overview> {
    const ds = await load()
    await sleep(220)
    const kpi = ds.kpis[range][region]
    const rows = ds.provinceRows[range]
    const hourly = ds.hourly[range][region]
    const compare = ds.compare[range][region]
    const alerts = ds.alerts.filter((a) => region === 'all' || a.region === region).slice(0, 6)
    const topCells = ds.cells
      .filter((c) => region === 'all' || c.region === region)
      .sort((a, b) => b.utilization[range] - a.utilization[range])
      .slice(0, 5)
      .map((c) => toRow(c, range, warn, congest))
    return {
      kpi,
      hourly,
      compare,
      alerts,
      topCells,
      regionShare: regionShares(rows),
      peakIndex: hourly.indexOf(Math.max(...hourly))
    }
  },

  async hourly(range: RangeKey, region: RegionKey): Promise<HourlyData> {
    const ds = await load()
    await sleep(160)
    const current = ds.hourly[range][region]
    const compare = ds.compare[range][region]
    const peakBytes = Math.max(...current)
    return {
      current,
      compare,
      peakIndex: current.indexOf(peakBytes),
      peakBytes,
      avgBytes: current.reduce((a, b) => a + b, 0) / 24
    }
  },

  async heatmap(region: RegionKey): Promise<[number, number, number][]> {
    const ds = await load()
    await sleep(140)
    return ds.heatmap[region]
  },

  async provinces(range: RangeKey): Promise<ProvinceRow[]> {
    const ds = await load()
    await sleep(160)
    return ds.provinceRows[range]
  },

  async cells(range: RangeKey, region: RegionKey, warn = 70, congest = 85): Promise<CellsData> {
    const ds = await load()
    await sleep(200)
    const rows = ds.cells
      .filter((c) => region === 'all' || c.region === region)
      .map((c) => toRow(c, range, warn, congest))
    const congested = rows.filter((r) => r.status === '拥塞').length
    const warning = rows.filter((r) => r.status === '预警').length
    return {
      rows,
      total: rows.length,
      summary: {
        total: rows.length,
        warning,
        congested,
        expandable: congested + warning,
        avgUtil: rows.reduce((s, r) => s + r.util, 0) / Math.max(1, rows.length)
      }
    }
  },

  async alerts(): Promise<Alert[]> {
    const ds = await load()
    await sleep(100)
    return ds.alerts
  },

  async jobs(): Promise<Job[]> {
    const ds = await load()
    await sleep(100)
    return ds.jobs
  },

  async pipeline(): Promise<Pipeline> {
    const ds = await load()
    await sleep(100)
    return ds.pipeline
  }
}
