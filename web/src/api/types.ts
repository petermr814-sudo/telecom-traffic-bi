export type RangeKey = 'today' | '7d' | '30d'
export type RegionKey = 'all' | '华北' | '东北' | '华东' | '华中' | '华南' | '西南' | '西北'

export interface KpiBlock {
  totalBytes: number
  activeUsers: number
  peakBps: number
  peakHour: number
  busyCellRatio: number
  fiveGShare: number
  perUserBytes: number
  delta: Record<'total' | 'users' | 'peak' | 'busy' | 'fiveG' | 'perUser', number>
}

export interface Alert {
  id: string
  time: string
  level: '严重' | '警告' | '提示'
  region: RegionKey
  cellId: string
  cellName: string
  metric: string
  value: string
  message: string
  status: '待处理' | '已确认'
}

export interface Cell {
  id: string
  name: string
  city: string
  province: string
  region: RegionKey
  type: string
  generation: '5G' | '4G'
  bandwidthMbps: number
  users: number
  baseUtil: number
  utilization: Record<RangeKey, number>
  trend: number[]
  trafficBytes: number
  busyMbps: number
}

export interface CellRow extends Cell {
  util: number
  traffic: number
  status: '正常' | '预警' | '拥塞'
  headroomMbps: number
}

export interface ProvinceRow {
  province: string
  region: RegionKey
  trafficBytes: number
  users: number
  perUserBytes: number
  share: number
  growth: number
  cells: number
}

export interface Job {
  id: string
  name: string
  engine: string
  status: '运行中' | '成功' | '失败'
  startTime: string
  duration: string
  rows: number
  output: string
  owner: string
}

export interface PipelineStage {
  name: string
  detail: string
  status: string
  metric: string
}

export interface PipelineSource {
  name: string
  topic: string
  detail: string
  status: string
  lag: number | null
}

export interface Pipeline {
  sources: PipelineSource[]
  stages: PipelineStage[]
}

export interface Meta {
  operator: string
  generatedAt: string
  dateStart: string
  dateEnd: string
  provinceCount: number
  cellCount: number
  records: number
  mode: string
  contractVersion: string
  lastSync: string
}

export interface RegionSlice {
  region: string
  bytes: number
  share: number
}

export interface Overview {
  kpi: KpiBlock
  hourly: number[]
  compare: number[]
  alerts: Alert[]
  topCells: CellRow[]
  regionShare: RegionSlice[]
  peakIndex: number
}

export interface HourlyData {
  current: number[]
  compare: number[]
  peakIndex: number
  peakBytes: number
  avgBytes: number
}

export interface HeatmapPoint {
  value: [number, number, number]
}

export interface CellsData {
  rows: CellRow[]
  total: number
  summary: {
    total: number
    warning: number
    congested: number
    expandable: number
    avgUtil: number
  }
}

export interface Dataset {
  meta: Meta
  regions: string[]
  provinces: { name: string; region: RegionKey }[]
  kpis: Record<RangeKey, Record<RegionKey, KpiBlock>>
  hourly: Record<RangeKey, Record<RegionKey, number[]>>
  compare: Record<RangeKey, Record<RegionKey, number[]>>
  heatmap: Record<RegionKey, [number, number, number][]>
  provinceRows: Record<RangeKey, ProvinceRow[]>
  cells: Cell[]
  alerts: Alert[]
  jobs: Job[]
  pipeline: Pipeline
}
