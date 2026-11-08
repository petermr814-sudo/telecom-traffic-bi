import * as THREE from 'three'

export const HEIGHT_SCALE = 1.12 / (111320 * Math.cos(36 * Math.PI / 180)) * 24
export const TERRAIN_BASE = 0.12
export interface DemInfo { file: string; zoom: number; tileX: number; tileY: number; pixelScale?: number; width: number; height: number }
export interface MeshInfo { file: string; vertices: number; indices: number; minElevation: number; maxElevation: number }
export interface CityTerrain extends MeshInfo { dem: DemInfo; bounds: number[] }
export interface TerrainManifest { national: MeshInfo; dem: DemInfo; cities: Record<string, CityTerrain>; verticalExaggeration: number }
const root = `${import.meta.env.BASE_URL}geo/terrain/`
async function read(file: string, signal?: AbortSignal) {
  const response = await fetch(root + file, { signal })
  if (!response.ok) throw new Error(`地形资源加载失败 (${response.status})`)
  return response
}
export async function loadManifest(signal: AbortSignal): Promise<TerrainManifest> { return (await read('manifest.json', signal)).json() }
export class ElevationRaster {
  constructor(readonly info: DemInfo, readonly heights: Int16Array) {}
  elevation(lng: number, lat: number) {
    const size = 256 * 2 ** this.info.zoom
    const merc = Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))
    const stride = this.info.pixelScale ?? 1
    const x = THREE.MathUtils.clamp(((lng + 180) / 360 * size - this.info.tileX * 256 - .5) / stride, 0, this.info.width - 1)
    const y = THREE.MathUtils.clamp(((1 - merc / Math.PI) / 2 * size - this.info.tileY * 256 - .5) / stride, 0, this.info.height - 1)
    const xi = Math.floor(x), yi = Math.floor(y), dx = x - xi, dy = y - yi
    const sample = (xx: number, yy: number) => this.heights[Math.min(yy, this.info.height - 1) * this.info.width + Math.min(xx, this.info.width - 1)]
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(sample(xi, yi), sample(xi + 1, yi), dx), THREE.MathUtils.lerp(sample(xi, yi + 1), sample(xi + 1, yi + 1), dx), dy)
  }
  height(lng: number, lat: number) { return TERRAIN_BASE + this.elevation(lng, lat) * HEIGHT_SCALE }
  // False outside the raster: callers can fall back to another raster instead of
  // reading the clamped edge sample, which would lift geometry off the visible terrain.
  contains(lng: number, lat: number) {
    const size = 256 * 2 ** this.info.zoom
    const merc = Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))
    const stride = this.info.pixelScale ?? 1
    const x = ((lng + 180) / 360 * size - this.info.tileX * 256 - .5) / stride
    const y = ((1 - merc / Math.PI) / 2 * size - this.info.tileY * 256 - .5) / stride
    return x >= 0 && x <= this.info.width - 1 && y >= 0 && y <= this.info.height - 1
  }
}
export async function loadDem(info: DemInfo, signal: AbortSignal) {
  const buffer = await (await read(info.file, signal)).arrayBuffer()
  if (buffer.byteLength !== info.width * info.height * 2) throw new Error('地形高程数据不完整')
  return new ElevationRaster(info, new Int16Array(buffer))
}
export async function loadSurface(info: MeshInfo, signal: AbortSignal) {
  const buffer = await (await read(info.file, signal)).arrayBuffer()
  if (buffer.byteLength !== info.vertices * 12 + info.indices * 4) throw new Error('地形网格数据不完整')
  const positions = new Float32Array(buffer, 0, info.vertices * 3)
  for (let i = 1; i < positions.length; i += 3) positions[i] = TERRAIN_BASE + positions[i] * HEIGHT_SCALE
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer, info.vertices * 12, info.indices), 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  const material = new THREE.MeshStandardMaterial({ color: '#f7f6f2', roughness: 0.92, metalness: 0, side: THREE.FrontSide })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}
