export const C = {
  primary: '#1f5eff',
  primarySoft: 'rgba(31,94,255,0.12)',
  cyan: '#0891b2',
  teal: '#0e9f6e',
  violet: '#6d5ce7',
  amber: '#d97a00',
  red: '#dc2f2f',
  text: '#0c1526',
  text2: '#51607a',
  axis: '#8b97ad',
  grid: '#eef2f8',
  border: '#e6ebf4'
}

export const chartPalette = [C.primary, '#0891b2', '#6d5ce7', '#0e9f6e', '#d97a00', '#dc2f2f', '#64748b']

export const axisLabel = {
  color: C.axis,
  fontSize: 10.5,
  fontFamily: 'Inter, "Segoe UI", "Microsoft YaHei", sans-serif'
}

export const splitLine = {
  lineStyle: { color: C.grid, type: [3, 3] as number[] }
}

export const tooltipBase = {
  backgroundColor: 'rgba(12,21,38,0.94)',
  borderWidth: 0,
  padding: [9, 11] as [number, number],
  textStyle: { color: '#fff', fontSize: 11.5, fontFamily: 'Inter, "Segoe UI", "Microsoft YaHei", sans-serif' },
  extraCssText: 'border-radius:9px;box-shadow:0 12px 32px rgba(12,21,38,.24);'
}

export const gridBase = { left: 8, right: 12, top: 24, bottom: 4, containLabel: true }
