import { readFile, writeFile } from 'node:fs/promises'

// Individual province outlines carry more coastal detail than the national overview.
const base = new URL('../public/geo/', import.meta.url)
const china = JSON.parse(await readFile(new URL('china.json', base), 'utf8'))
const features = new Array(china.features.length)
let cursor = 0
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < china.features.length) {
    const index = cursor++
    const feature = china.features[index]
    if (!feature.properties.name) { features[index] = feature; continue }
    const res = await fetch(`https://geo.datav.aliyun.com/areas_v3/bound/${feature.properties.adcode}.json`, { signal: AbortSignal.timeout(30000) })
    if (!res.ok) throw new Error(`${feature.properties.name}: ${res.status}`)
    const geo = await res.json()
    if (!geo.features?.[0]?.geometry) throw new Error(`Invalid geometry: ${feature.properties.name}`)
    features[index] = { ...geo.features[0], properties: feature.properties }
  }
}))
await writeFile(new URL('provinces-detail.json', base), JSON.stringify({ type: 'FeatureCollection', features }))
console.log(`Saved ${features.length} detailed province outlines.`)
