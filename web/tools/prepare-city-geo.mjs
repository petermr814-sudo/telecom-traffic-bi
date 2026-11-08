// Refresh the local city boundaries from the same DataV source as china.json.
import { readFile, writeFile } from 'node:fs/promises'
const root = new URL('../public/', import.meta.url)
const china = JSON.parse(await readFile(new URL('geo/china.json', root), 'utf8'))
const dataset = JSON.parse(await readFile(new URL('data/dataset.json', root), 'utf8'))
const cities = [...new Map(dataset.cells.map(c => [c.city, { city: c.city, province: c.province }])).values()]
const provinces = [...new Set(cities.map(c => c.province))]
const features = []
const queue = [...provinces]
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const province = queue.shift()
    const parent = china.features.find(f => f.properties.name === province)
    let candidates = [parent]
    if (![110000, 120000, 310000, 500000].includes(parent.properties.adcode)) {
      const url = `https://geo.datav.aliyun.com/areas_v3/bound/${parent.properties.adcode}_full.json`
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
      if (!res.ok) throw new Error(`${province}: HTTP ${res.status}`)
      candidates = (await res.json()).features
    }
    for (const city of cities.filter(c => c.province === province)) {
      const f = candidates.find(f => f.properties.name?.startsWith(city.city))
      if (!f?.geometry || !f.properties.center) throw new Error(`Missing geometry: ${city.city}`)
      features.push({ type: 'Feature', properties: { name: city.city, fullName: f.properties.name, province, adcode: f.properties.adcode, center: f.properties.center }, geometry: f.geometry })
    }
  }
}))
features.sort((a,b) => a.properties.adcode - b.properties.adcode)
await writeFile(new URL('cities.json', new URL('geo/', root)), JSON.stringify({ type: 'FeatureCollection', features }))
console.log(`Saved ${features.length} city boundaries and official center coordinates.`)
