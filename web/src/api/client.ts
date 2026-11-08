import type {
  Alert, CellsData, HourlyData, Job, Meta, Overview, Pipeline, ProvinceRow,
  RangeKey, RegionKey
} from './types'
import { mock } from './mock'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'
// 开发环境走 Vite 代理（/api），生产环境同域部署时留空；跨域直连才填绝对地址。
const BASE = import.meta.env.DEV ? '' : ((import.meta.env.VITE_API_BASE as string) || '')

export const dataMode = MODE

interface Envelope<T> {
  code?: number
  message?: string
  data?: T
}

async function request<T>(path: string, params: Record<string, string | number | undefined>, fallback: () => Promise<T>): Promise<T> {
  if (MODE !== 'api') return fallback()
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v))
  const url = `${BASE}${path}${qs.toString() ? `?${qs}` : ''}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`接口 ${path} 返回 ${res.status}`)
  const json = (await res.json()) as Envelope<T> | T
  if (json && typeof json === 'object' && 'data' in json) {
    const env = json as Envelope<T>
    if (env.code !== undefined && env.code !== 0) throw new Error(env.message || `接口 ${path} 业务错误`)
    return env.data as T
  }
  return json as T
}

export const api = {
  mode: MODE,
  meta: () => request<Meta>('/api/v1/meta', {}, () => mock.meta()),
  overview: (range: RangeKey, region: RegionKey, warn = 70, congest = 85) =>
    request<Overview>('/api/v1/overview', { range, region, warn, congest }, () => mock.overview(range, region, warn, congest)),
  hourly: (range: RangeKey, region: RegionKey) =>
    request<HourlyData>('/api/v1/hourly', { range, region }, () => mock.hourly(range, region)),
  heatmap: (region: RegionKey) =>
    request<[number, number, number][]>('/api/v1/heatmap', { region }, () => mock.heatmap(region)),
  provinces: (range: RangeKey) =>
    request<ProvinceRow[]>('/api/v1/provinces', { range }, () => mock.provinces(range)),
  cells: (range: RangeKey, region: RegionKey, warn = 70, congest = 85) =>
    request<CellsData>('/api/v1/cells', { range, region, warn, congest }, () => mock.cells(range, region, warn, congest)),
  alerts: () => request<Alert[]>('/api/v1/alerts', {}, () => mock.alerts()),
  jobs: () => request<Job[]>('/api/v1/jobs', {}, () => mock.jobs()),
  pipeline: () => request<Pipeline>('/api/v1/pipeline', {}, () => mock.pipeline())
}
