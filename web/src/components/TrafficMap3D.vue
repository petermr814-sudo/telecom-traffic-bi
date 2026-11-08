<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import Icon from './Icon.vue'
import { loadManifest, loadDem, loadSurface, TERRAIN_BASE, type TerrainManifest, type ElevationRaster } from '@/lib/terrain'
import type { ProvinceRow } from '@/api/types'
import { cityMetric, type CityTraffic, type MapMetric } from '@/lib/cityTraffic'

const props = defineProps<{ cities: CityTraffic[]; provinces: ProvinceRow[]; metric: MapMetric; selected: string | null }>()
const emit = defineEmits<{ select: [name: string]; reset: []; moving: [value: boolean] }>()
type Coordinate = [number, number]
type Feature = { properties: { name: string; center?: Coordinate; province?: string }; geometry: { type: string; coordinates: Coordinate[][] | Coordinate[][][] } }
const host = ref<HTMLDivElement>()
const labelLayer = ref<HTMLDivElement>()
const loading = ref(true)
const error = ref('')
const moving = ref(false)
const insetPaths = ref<string[]>([])
const selectedCity = computed(() => props.cities.find(c => c.name === props.selected))
let renderer: THREE.WebGLRenderer | undefined
let controls: OrbitControls | undefined
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400)
const land = new THREE.Group()
const provinceGroup = new THREE.Group()
const markerGroup = new THREE.Group()
const focusGroup = new THREE.Group()
const contextGroup = new THREE.Group()
let manifest: TerrainManifest | undefined
let nationalDem: ElevationRaster | undefined
let activeDem: ElevationRaster | undefined
let nationalSurface: THREE.Mesh | undefined
let citySurface: THREE.Mesh | undefined
let detailRequest = 0
const detailCache = new Map<string, { mesh: THREE.Mesh; dem: ElevationRaster }>()
const terrainStatus = ref('真实高程 · 垂直夸张 ×24')
const terrainDetail = ref('national')
const geographyLabels = [
  { name: '青藏高原', coords: [87, 32] as Coordinate },
  { name: '天山', coords: [84.5, 43] as Coordinate },
  { name: '塔里木盆地', coords: [83, 39.5] as Coordinate },
  { name: '四川盆地', coords: [105, 30.5] as Coordinate },
  { name: '华北平原', coords: [115.5, 36] as Coordinate }
]
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const projected = new THREE.Vector3()
const markerObjects = new Map<string, { group: THREE.Group; height: number; center: THREE.Vector3 }>()
let cityGeo: Feature[] = []
let raf = 0
let destroyed = false
let visible = true
let dirty = true
let ro: ResizeObserver | undefined
let io: IntersectionObserver | undefined
let dragStart: { x: number; y: number } | undefined
let width = 0
let height = 0
const abort = new AbortController()
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
let flight: { mode: 'cinematic' | 'glide'; start: number; from: THREE.Vector3; to: THREE.Vector3; fromTarget: THREE.Vector3; target: THREE.Vector3; duration: number; dist: number } | null = null
let lastNow = 0
const homeTarget = new THREE.Vector3(0, 0, 0)

function project([lng, lat]: Coordinate) {
  // A single Mercator projection is shared by the province and city boundaries.
  const mercator = (v: number) => Math.log(Math.tan(Math.PI / 4 + v * Math.PI / 360)) * 180 / Math.PI
  return new THREE.Vector2((lng - 104.5) * 1.12, (mercator(lat) - mercator(36)) * 1.12)
}
function polygons(feature: Feature): Coordinate[][][] {
  return feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates as Coordinate[][]] : feature.geometry.coordinates as Coordinate[][][]
}
function disposeGroup(group: THREE.Object3D) {
  group.traverse(obj => {
    const mesh = obj as THREE.Mesh
    mesh.geometry?.dispose()
    const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []
    materials.forEach(m => m.dispose())
  })
  group.clear()
}
function terrainHeight(point: Coordinate) {
  if (!activeDem) return TERRAIN_BASE
  // Outside the city raster the fine DEM only clamps to its edge, which would float
  // markers and lines above the visible national terrain kept underneath as context.
  if (activeDem !== nationalDem && nationalDem && !activeDem.contains(point[0], point[1])) return nationalDem.height(point[0], point[1])
  return activeDem.height(point[0], point[1])
}
const GHOST_OPACITY = 0.42
let ghostMix = 0
let ghostTarget = 0
function applyGhostMix() {
  if (!nationalSurface) return
  const material = nationalSurface.material as THREE.MeshStandardMaterial
  material.opacity = 1 - ghostMix * (1 - GHOST_OPACITY)
}
function setGhost(ghost: boolean) {
  const target = ghost ? 1 : 0
  if (ghostTarget === target) return
  ghostTarget = target
  if (reduced.matches) { ghostMix = target; applyGhostMix() }
  dirty = true
  wake()
}
function addBoundary(feature: Feature, group: THREE.Group, selected = false) {
  for (const polygon of polygons(feature)) {
    if (!polygon[0]?.length) continue
    if (Math.max(...polygon[0].map(p => p[1])) < 18) {
      if (!selected && group === provinceGroup) insetPaths.value.push(polygon[0].map((p, i) => `${i ? 'L' : 'M'}${((p[0] - 105) * 5).toFixed(2)},${((24 - p[1]) * 5).toFixed(2)}`).join(' ') + 'Z')
      continue
    }
    const points: THREE.Vector3[] = []
    const ring = polygon[0]
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length]
      const segments = Math.max(1, Math.ceil(Math.hypot(a[0] - b[0], a[1] - b[1]) / (props.selected ? .007 : .04)))
      for (let j = 0; j < segments; j++) {
        const point: Coordinate = [a[0] + (b[0] - a[0]) * j / segments, a[1] + (b[1] - a[1]) * j / segments]
        const p = project(point)
        points.push(new THREE.Vector3(p.x, terrainHeight(point) + (selected ? .018 : .01), -p.y))
      }
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    group.add(new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color: selected ? '#4a6662' : '#a4aaa9', transparent: true, opacity: selected ? .95 : .22, depthWrite: false })))
  }
}
function redrawBoundaries() {
  disposeGroup(focusGroup)
  disposeGroup(contextGroup)
  const feature = cityGeo.find(g => g.properties.name === props.selected)
  if (feature) addBoundary(feature, focusGroup, true)
  for (const f of cityGeo.filter(g => g.properties.province === selectedCity.value?.province && g.properties.name !== props.selected)) addBoundary(f, contextGroup)
}
function updateColors() { dirty = true }
async function loadCityTerrain() {
  const request = ++detailRequest
  const name = props.selected
  const info = name && manifest?.cities[name]
  if (!info) {
    if (citySurface) { land.remove(citySurface); citySurface = undefined }
    provinceGroup.visible = true
    activeDem = nationalDem
    terrainDetail.value = 'national'
    terrainStatus.value = '真实高程 · 垂直夸张 ×24'
    setGhost(false)
    redrawBoundaries(); updateMarkers(); dirty = true
    return
  }
  // Keep the national terrain underneath as a soft context layer while switching,
  // so a failed detail request cannot leave an empty void around the new destination.
  if (citySurface) { land.remove(citySurface); citySurface = undefined }
  provinceGroup.visible = false
  activeDem = nationalDem
  terrainDetail.value = 'national'
  terrainStatus.value = '正在载入城市周边精细地形…'
  setGhost(true)
  try {
    const cached = detailCache.get(name as string)
    const [mesh, dem] = cached ? [cached.mesh, cached.dem] : await Promise.all([loadSurface(info, abort.signal), loadDem(info.dem, abort.signal)])
    if (destroyed || request !== detailRequest) { if (!cached) disposeGroup(mesh); return }
    detailCache.delete(name as string)
    detailCache.set(name as string, { mesh, dem })
    while (detailCache.size > 4) {
      const oldest = detailCache.keys().next().value!
      disposeGroup(detailCache.get(oldest)!.mesh)
      detailCache.delete(oldest)
    }
    citySurface = mesh
    land.add(mesh)
    activeDem = dem
    terrainDetail.value = name as string
    terrainStatus.value = '城市周边 DEM 地形 · 垂直夸张 ×6'
    redrawBoundaries(); updateMarkers(); dirty = true
    wake()
  } catch (e) {
    if (!destroyed && request === detailRequest) {
      // No city mesh to highlight: the national terrain must return to full strength.
      provinceGroup.visible = true
      setGhost(false)
      redrawBoundaries(); updateMarkers()
      terrainStatus.value = '城市精细地形载入失败 · 当前使用全国地形'
    }
  }
}
function updateMarkers() {
  disposeGroup(markerGroup)
  markerObjects.clear()
  const max = Math.max(...props.cities.map(c => Math.abs(cityMetric(c, props.metric, props.provinces))), 1)
  for (const city of props.cities) {
    const geo = cityGeo.find(g => g.properties.name === city.name)
    if (!geo?.properties.center) continue
    const p = project(geo.properties.center)
    const selected = city.name === props.selected
    const center = new THREE.Vector3(p.x, terrainHeight(geo.properties.center) + .035, -p.y)
    const value = cityMetric(city, props.metric, props.provinces)
    const barHeight = props.selected ? 0.05 + Math.sqrt(Math.abs(value) / max) * 0.12 : 0.12 + Math.sqrt(Math.abs(value) / max) * 0.7
    const group = new THREE.Group()
    group.position.copy(center)
    const color = selected ? '#49675e' : '#6b7e82'
    const radius = props.selected ? 0.018 : 0.038
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, barHeight, 12), new THREE.MeshBasicMaterial({ color, transparent: true, toneMapped: false, opacity: selected ? 1 : props.selected ? 0.2 : 0.8 }))
    beam.position.y = barHeight / 2
    const dot = new THREE.Mesh(new THREE.SphereGeometry(props.selected ? 0.04 : 0.085, 16, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: props.selected && !selected ? 0.3 : 1 }))
    dot.position.y = barHeight
    const ring = new THREE.Mesh(new THREE.RingGeometry(props.selected ? 0.08 : 0.14, props.selected ? 0.09 : 0.17, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65, side: THREE.DoubleSide }))
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.04
    // Transparent hit target keeps small bars easy to select without inventing map points.
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, barHeight + 0.6, 8), new THREE.MeshBasicMaterial({ visible: false }))
    hit.position.y = barHeight / 2
    group.add(beam, dot, ring, hit)
    group.traverse(obj => { obj.userData.city = city.name })
    markerGroup.add(group)
    markerObjects.set(city.name, { group, height: barHeight, center })
  }
  dirty = true
}
function updateFocus() {
  // Starts the terrain swap first so the redraw below samples the national DEM
  // while the city detail is still loading.
  void loadCityTerrain()
  redrawBoundaries()
  updateMarkers()
}
function homePosition() {
  const fit = Math.max(1, 1.45 / Math.max(camera.aspect, 0.35))
  return new THREE.Vector3(0, 57 * fit, 48 * fit)
}
function setMoving(value: boolean) { moving.value = value; emit('moving', value) }
function flyToCity(instant = false, mode: 'cinematic' | 'glide' = 'cinematic') {
  if (!controls) return
  const marker = props.selected ? markerObjects.get(props.selected) : undefined
  const target = marker ? marker.center.clone() : homeTarget.clone()
  let destination = homePosition()
  if (marker) {
    const feature = cityGeo.find(g => g.properties.name === props.selected)
    const bounds = new THREE.Box2()
    if (feature) polygons(feature).forEach(poly => poly[0].forEach(point => bounds.expandByPoint(project(point))))
    const span = bounds.isEmpty() ? 4 : Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y)
    if (!bounds.isEmpty()) {
      target.x = (bounds.min.x + bounds.max.x) / 2
      target.z = -(bounds.min.y + bounds.max.y) / 2
    }
    target.y = terrainHeight(feature?.properties.center ?? [104.5, 36]) * .25
    const distance = Math.max(1.8, span * 1.3) * Math.max(1, 0.85 / camera.aspect)
    destination = target.clone().add(new THREE.Vector3(distance * 0.12, distance * 1.2, distance * 0.8))
  }
  // Cancel inertia before taking camera ownership; a new click starts at the current pose.
  controls.enableDamping = false
  controls.update()
  controls.enableDamping = !reduced.matches
  const animate = !instant && !reduced.matches
  flight = {
    mode: animate && mode === 'glide' ? 'glide' : 'cinematic',
    start: performance.now(),
    from: camera.position.clone(),
    to: destination,
    fromTarget: controls.target.clone(),
    target,
    duration: animate ? 1450 : 0,
    dist: camera.position.distanceTo(destination)
  }
  setMoving(animate)
  dirty = true
  wake()
}
function renderLabels() {
  const labels = labelLayer.value?.querySelectorAll<HTMLButtonElement>('.city-pin')
  if (!labels) return
  const occupied: { x: number; y: number }[] = []
  // Selected city always wins collision detection. Hidden labels remain accessible in the city list.
  const ordered = [...labels].sort((a, b) => Number(b.dataset.city === props.selected) - Number(a.dataset.city === props.selected))
  for (const label of ordered) {
    const marker = markerObjects.get(label.dataset.city!)
    if (!marker) { label.hidden = true; continue }
    projected.copy(marker.center).add(new THREE.Vector3(0, marker.height + (props.selected ? 0.12 : 0.2), 0))
    projected.y *= land.scale.y
    projected.project(camera)
    const x = (projected.x + 1) * width / 2
    const y = (1 - projected.y) * height / 2
    const onScreen = projected.z > -1 && projected.z < 1 && x > 22 && x < width - 26 && y > 54 && y < height - 60
    const overlaps = occupied.some(p => Math.abs(p.x - x) < 55 && Math.abs(p.y - y) < 27)
    label.hidden = !onScreen || overlaps
    if (!label.hidden) {
      label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`
      occupied.push({ x, y })
    }
  }
}
function renderGeographyLabels() {
  host.value?.querySelectorAll<HTMLElement>('.geography-label').forEach((label, i) => {
    const point = geographyLabels[i].coords
    const p = project(point)
    projected.set(p.x, terrainHeight(point) + .1, -p.y).project(camera)
    label.hidden = !!props.selected || projected.z < -1 || projected.z > 1
    label.style.transform = `translate(${(projected.x + 1) * width / 2}px, ${(1 - projected.y) * height / 2}px) translate(-50%, -50%)`
  })
}
function tick(now: number) {
  raf = 0
  if (destroyed || !renderer || !controls || !visible || document.hidden) return
  const dt = Math.min(Math.max((now - lastNow) / 1000, 0), 0.1)
  lastNow = now
  if (flight) {
    if (flight.mode === 'glide') {
      // Real-time damped travel: every frame re-computes the move toward the
      // destination from the live pose, instead of replaying the focus timeline.
      if (reduced.matches) {
        camera.position.copy(flight.to)
        controls.target.copy(flight.target)
      } else {
        const rate = THREE.MathUtils.clamp(26 / (flight.dist + 2), 2.4, 7)
        camera.position.lerp(flight.to, 1 - Math.exp(-rate * dt))
        controls.target.lerp(flight.target, 1 - Math.exp(-rate * dt))
      }
      const arrived = reduced.matches || (camera.position.distanceTo(flight.to) < 0.01 && controls.target.distanceTo(flight.target) < 0.01)
      if (arrived) {
        camera.position.copy(flight.to)
        controls.target.copy(flight.target)
        flight = null
        setMoving(false)
      }
    } else {
      const t = flight.duration ? Math.min((now - flight.start) / flight.duration, 1) : 1
      const eased = t * t * t * (t * (t * 6 - 15) + 10)
      camera.position.lerpVectors(flight.from, flight.to, eased)
      camera.position.y += Math.sin(Math.PI * t) * flight.from.distanceTo(flight.to) * 0.075
      controls.target.lerpVectors(flight.fromTarget, flight.target, eased)
      if (t === 1) { flight = null; setMoving(false) }
    }
    dirty = true
  }
  if (ghostMix !== ghostTarget) {
    if (reduced.matches) ghostMix = ghostTarget
    else {
      ghostMix += (ghostTarget - ghostMix) * (1 - Math.exp(-6 * dt))
      if (Math.abs(ghostTarget - ghostMix) < 0.004) ghostMix = ghostTarget
    }
    applyGhostMix()
    dirty = true
  }
  if (controls.update()) dirty = true
  if (dirty) {
    land.scale.y = props.selected ? .25 : 1
    land.updateMatrixWorld(true)
    renderer.render(scene, camera)
    renderLabels()
    renderGeographyLabels()
    dirty = false
  }
  raf = requestAnimationFrame(tick)
}
function wake() { if (!raf && !destroyed) raf = requestAnimationFrame(tick) }
function resize() {
  if (!host.value || !renderer) return
  width = host.value.clientWidth
  height = host.value.clientHeight
  if (!width || !height) return
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
  flyToCity(true)
  dirty = true
}
function hitCity(event: PointerEvent) {
  if (!host.value) return undefined
  const rect = host.value.getBoundingClientRect()
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
  raycaster.setFromCamera(pointer, camera)
  return raycaster.intersectObjects(markerGroup.children, true)[0]?.object.userData.city as string | undefined
}
function onDown(event: PointerEvent) { dragStart = { x: event.clientX, y: event.clientY } }
function onUp(event: PointerEvent) {
  if (event.button !== 0 || !dragStart || Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) > 5) return
  const city = hitCity(event)
  if (city) emit('select', city)
  dragStart = undefined
}
function onMove(event: PointerEvent) {
  if (renderer) renderer.domElement.style.cursor = hitCity(event) ? 'pointer' : 'grab'
}
function cancelFlight() { flight = null; setMoving(false) }
function resetView() {
  // Leaving a city flies home via the selected watch; when already national the
  // button just re-frames the camera.
  if (props.selected) emit('reset')
  else flyToCity()
}
function zoom(factor: number) {
  if (!controls) return
  cancelFlight()
  const offset = camera.position.clone().sub(controls.target)
  offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance))
  camera.position.copy(controls.target).add(offset)
  controls.update()
  dirty = true
}
function onVisibility() { if (!document.hidden) { dirty = true; wake() } }
function onMotionChange() { if (controls) controls.enableDamping = !reduced.matches; if (flight && reduced.matches) flight.duration = 0 }
function onContextLost(event: Event) {
  event.preventDefault()
  cancelAnimationFrame(raf)
  raf = 0
  error.value = '3D 显示已中断，可继续从右侧城市列表查看详情。'
}
function onContextRestored() { error.value = ''; dirty = true; wake() }

onMounted(async () => {
  try {
    const [china, cities] = await Promise.all(['provinces-detail', 'cities'].map(async name => {
      const res = await fetch(`${import.meta.env.BASE_URL}geo/${name}.json`, { signal: abort.signal })
      if (!res.ok) throw new Error('地图文件加载失败')
      return await res.json() as { features: Feature[] }
    }))
    if (destroyed || !host.value) return
    cityGeo = cities.features
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    renderer.setClearColor('#eeefed', 1)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.setAttribute('aria-label', '真实高程白模地形地图，可拖动旋转、滚轮缩放，点击城市聚焦')
    host.value.prepend(renderer.domElement)
    scene.add(new THREE.HemisphereLight('#ffffff', '#aaa9a4', 1.2))
    const sun = new THREE.DirectionalLight('#fffaf0', 2.8)
    sun.position.set(-35, 25, -28)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 40, bottom: -40, near: 1, far: 150 })
    sun.shadow.bias = -0.0003
    sun.shadow.normalBias = 0.012
    sun.shadow.radius = 4
    const fill = new THREE.DirectionalLight('#ffffff', 0.35)
    fill.position.set(30, 20, 35)
    land.add(provinceGroup, contextGroup, markerGroup, focusGroup)
    scene.add(sun, fill, land)
    scene.fog = new THREE.FogExp2('#eeefed', 0.002)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: '#e8e9e6', roughness: 0.94, metalness: 0.05 }))
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.25
    floor.receiveShadow = true
    scene.add(floor)
    manifest = await loadManifest(abort.signal)
    const [surface, dem] = await Promise.all([loadSurface(manifest.national, abort.signal), loadDem(manifest.dem, abort.signal)])
    if (destroyed) { disposeGroup(surface); return }
    nationalSurface = surface
    // Stays transparent for the whole session: focused city views fade this layer
    // into a soft ghost instead of hiding it, so the rest of the map stays visible.
    const surfaceMaterial = surface.material as THREE.MeshStandardMaterial
    surfaceMaterial.transparent = true
    surfaceMaterial.polygonOffset = true
    surfaceMaterial.polygonOffsetFactor = 1
    surfaceMaterial.polygonOffsetUnits = 1
    nationalDem = dem
    activeDem = dem
    land.add(surface)
    for (const feature of china.features) addBoundary(feature, provinceGroup)
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = !reduced.matches
    controls.dampingFactor = 0.09
    controls.minDistance = 1.5
    controls.maxDistance = 270
    controls.minPolarAngle = 0.15
    controls.maxPolarAngle = Math.PI / 2.65
    controls.enablePan = true
    controls.addEventListener('start', cancelFlight)
    controls.addEventListener('change', () => { dirty = true })
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('webglcontextlost', onContextLost)
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored)
    updateColors()
    updateFocus()
    ro = new ResizeObserver(resize)
    ro.observe(host.value)
    io = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) wake() })
    io.observe(host.value)
    document.addEventListener('visibilitychange', onVisibility)
    reduced.addEventListener('change', onMotionChange)
    resize()
    wake()
  } catch (e) {
    if (!destroyed) error.value = `${(e as Error).message}。可从城市列表继续查看数据。`
  } finally { loading.value = false }
})
watch(() => props.selected, (name, prev) => {
  updateFocus()
  // Switching between focused cities travels in real time from the live pose;
  // entering a city (or returning home) keeps the cinematic focus animation.
  flyToCity(false, name && prev ? 'glide' : 'cinematic')
})
watch(() => [props.metric, props.cities, props.provinces], () => { updateColors(); updateMarkers() })
onUnmounted(() => {
  destroyed = true
  for (const item of detailCache.values()) { land.remove(item.mesh); disposeGroup(item.mesh) }
  detailCache.clear()
  abort.abort()
  cancelAnimationFrame(raf)
  ro?.disconnect()
  io?.disconnect()
  document.removeEventListener('visibilitychange', onVisibility)
  reduced.removeEventListener('change', onMotionChange)
  controls?.dispose()
  if (renderer) {
    renderer.domElement.removeEventListener('pointerdown', onDown)
    renderer.domElement.removeEventListener('pointerup', onUp)
    renderer.domElement.removeEventListener('pointermove', onMove)
    renderer.domElement.removeEventListener('webglcontextlost', onContextLost)
    renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored)
  }
  disposeGroup(scene)
  renderer?.dispose()
  renderer?.forceContextLoss()
  renderer?.domElement.remove()
})
</script>

<template>
  <div ref="host" class="traffic-scene" :data-view="selected || 'national'" :data-moving="moving" :data-metric="metric" :data-terrain="terrainDetail" :aria-busy="loading" @keydown.esc.stop="emit('reset')">
    <div class="scene-location"><span class="location-dot" /><span>{{ selected ? `${selectedCity?.province} / ${selected}` : '中国 · 全国视角' }}</span><span class="view-tag">{{ selected ? 'CITY' : '3D' }}</span></div>
    <div ref="labelLayer" class="city-labels" aria-label="地图城市">
      <button v-for="city in cities" :key="city.name" :data-city="city.name" class="city-pin" :class="{ 'is-selected': selected === city.name }" :aria-label="`聚焦${city.name}`" :aria-pressed="selected === city.name" hidden @click.stop="emit('select', city.name)">{{ city.name }}</button>
    </div>
    <div class="geography-labels" aria-hidden="true"><span v-for="place in geographyLabels" :key="place.name" class="geography-label" hidden>{{ place.name }}</span></div>
    <div class="terrain-source"><span>{{ terrainStatus }}</span><a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">Mapzen · USGS / NOAA</a></div>
    <div class="scene-tools" aria-label="地图控制">
      <button aria-label="返回全国视角" title="返回全国视角" @click="resetView"><Icon name="globe" :size="17" /></button>
      <span />
      <button aria-label="放大地图" title="放大" @click="zoom(0.78)"><Icon name="plus" :size="17" /></button>
      <button aria-label="缩小地图" title="缩小" @click="zoom(1.28)"><Icon name="minus" :size="17" /></button>
    </div>
    <div class="scene-compass" aria-hidden="true"><span>N</span><i /></div>
    <div v-if="!selected && insetPaths.length" class="south-sea" aria-label="南海诸岛"><svg viewBox="0 0 95 105"><path v-for="(d, i) in insetPaths" :key="i" :d="d" /></svg><span>南海诸岛</span></div>
    <div class="scene-caption"><Icon :name="moving ? 'target' : 'map'" :size="13" /><span>{{ moving ? `正在聚焦${selected || '全国'}…` : selected ? '已定位城市 · 拖动调整视角' : '点击城市探索 · 拖动旋转 · 滚轮缩放' }}</span></div>
    <div v-if="loading || error" class="scene-message" role="status"><Icon :name="error ? 'info' : 'globe'" :size="28" /><span>{{ error || '正在加载真实高程地形…' }}</span></div>
  </div>
</template>

<style scoped>
.traffic-scene { position:relative; height:540px; min-width:0; overflow:hidden; background:#eeefed; isolation:isolate; }
.traffic-scene :deep(canvas) { display:block; position:absolute; inset:0; touch-action:none; }
.scene-location { position:absolute; top:24px; left:26px; display:flex; align-items:center; gap:9px; color:#515d60; font-size:12px; pointer-events:none; z-index:2; }
.location-dot { width:5px; height:5px; border-radius:50%; background:#71867c; }
.view-tag { color:#7c8586; font:9px var(--mono); border:1px solid #c3c9c7; border-radius:4px; padding:2px 5px; }
.city-labels,.geography-labels { position:absolute; inset:0; pointer-events:none; z-index:2; }
.city-pin { position:absolute; top:0; left:0; padding:5px 7px; border:1px solid #bec7c073; border-radius:4px; pointer-events:auto; color:#46535b; font-size:10px; line-height:1; white-space:nowrap; background:#ffffffa8; cursor:pointer; transition:background 160ms ease; box-shadow:0 2px 5px #28352e08; }
.city-pin[hidden],.geography-label[hidden] { display:none; }
.city-pin.is-selected { color:#fff; background:#4d655d; border-color:#4d655d; padding:8px 12px; font-size:13px; }
.city-pin:hover,.city-pin:focus-visible { background:#e0e6e2; color:#263b32; outline:1px solid #77968b; }
.scene-tools { position:absolute; right:20px; top:22px; display:flex; flex-direction:column; border:1px solid #cbd1cd; background:#fbfcfae8; border-radius:9px; padding:4px; z-index:3; box-shadow:0 3px 12px #00000005; }
.scene-tools button { width:30px; height:32px; display:grid; place-items:center; color:#63716b; border-radius:5px; transition:background 160ms ease,transform 160ms ease; }
.scene-tools button:hover { background:#e6ebe7; }
.scene-tools button:active { transform:scale(.95); }
.scene-tools > span { height:1px; background:#d4dbd5; margin:3px; }
.scene-caption { position:absolute; bottom:23px; left:26px; display:flex; align-items:center; gap:8px; color:#758078; font-size:10px; pointer-events:none; background:#f1f2edaa; padding:5px; border-radius:4px; }
.scene-compass { position:absolute; right:28px; top:170px; color:#849088; font:10px var(--mono); display:grid; justify-items:center; gap:6px; }
.scene-compass i { width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-bottom:18px solid #71857a; }
.south-sea { position:absolute; bottom:20px; right:20px; width:70px; height:98px; border:1px solid #c4cdc6; border-radius:4px; background:#eff1ece0; pointer-events:none; }
.south-sea svg { width:100%; height:76px; fill:#f8f9f5; stroke:#909f96; stroke-width:.7; }
.south-sea span { display:block; text-align:center; color:#88938c; font-size:9px; }
.scene-message { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:16px; background:#eeefedf5; color:#687b70; padding:30px; text-align:center; font-size:13px; z-index:4; }
.geography-label { position:absolute; top:0; left:0; color:#6f7874; font-size:10px; letter-spacing:.12em; text-shadow:0 1px 4px #fff,0 -1px 4px #fff; }
.terrain-source { position:absolute; left:26px; top:51px; z-index:2; display:flex; flex-direction:column; gap:5px; color:#8b938c; font-size:9px; }
.terrain-source a { color:#8b938c; text-decoration:none; font-size:8px; }
@media(max-width:760px) { .traffic-scene { height:430px; } .scene-location { left:18px; top:20px; } .terrain-source { left:18px;top:47px; } .scene-caption { left:18px; bottom:17px;font-size:9px;max-width:72%; } .south-sea { width:53px;height:80px;right:15px;bottom:45px; } .south-sea svg { height:59px; } .geography-label {font-size:8px;} }
@media(prefers-reduced-motion:reduce) { .city-pin,.scene-tools button {transition:none;} }
</style>
