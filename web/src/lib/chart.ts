export const C = {
  primary: '#334eac',
  primarySoft: 'rgba(51,78,172,0.10)',
  cyan: '#0891b2',
  teal: '#0e9f6e',
  violet: '#6d5ce7',
  amber: '#d97a00',
  red: '#dc2f2f',
  text: '#0c1526',
  text2: '#51607a',
  axis: '#778399',
  grid: '#eef2f8',
  border: '#e6ebf4'
}

export const chartPalette = ['#334eac', '#7096d1', '#a6bddb', '#52678f', '#8f9eb8', '#b9c4d4', '#d7dfe9']

export const CHART_FONT = '"MiSans VF", MiSans, "PingFang SC", "Microsoft YaHei", sans-serif'

export const axisLabel = {
  color: C.axis,
  fontSize: 11,
  hideOverlap: true,
  fontFamily: CHART_FONT
}

export const splitLine = {
  lineStyle: { color: C.grid, type: 'solid' as const }
}

export const tooltipBase = {
  backgroundColor: 'rgba(12,21,38,0.94)',
  borderWidth: 0,
  padding: [9, 11] as [number, number],
  textStyle: { color: '#fff', fontSize: 11.5, fontFamily: CHART_FONT },
  extraCssText: 'border-radius:9px;box-shadow:0 12px 32px rgba(12,21,38,.24);'
}

export const gridBase = { left: 8, right: 12, top: 24, bottom: 4, containLabel: true }
