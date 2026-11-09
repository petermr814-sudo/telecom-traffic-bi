import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Box3, PerspectiveCamera, Vector3 } from 'three'
import { MapCameraMotion, fitMapDistance } from '../src/lib/mapCameraMotion.ts'

let checks = 0
function check(name, run) { run(); checks++; console.log('PASS', name) }
function rig() {
  const camera = new PerspectiveCamera(40, 1.6, 0.1, 400)
  const target = new Vector3(3, 0.4, -2)
  camera.position.copy(target).add(new Vector3(-15, 23, -31))
  return { camera, target, motion: new MapCameraMotion(camera, target, 1.5, 270) }
}
function settle(motion, dt = 1 / 60) {
  let steps = 0
  while (motion.active && steps++ < 600) motion.step(dt)
  assert.ok(!motion.active, 'Camera must come to rest')
}
function near(a, b, epsilon = 1e-8) { assert.ok(a.distanceTo(b) < epsilon, `${a.toArray()} vs ${b.toArray()}`) }

check('First focus preserves the user’s current heading and pitch throughout the move', () => {
  const { camera, target, motion } = rig()
  const direction = camera.position.clone().sub(target).normalize()
  const destination = new Vector3(16, 0.8, 12)
  motion.focus(destination, 5)
  for (let i = 0; i < 180; i++) {
    motion.step(1 / 60)
    near(camera.position.clone().sub(target).normalize(), direction)
  }
  near(target, destination)
  assert.ok(Math.abs(camera.position.distanceTo(target) - 5) < 1e-8)
  assert.ok(!motion.active)
})

check('Retargeting leaves the live pose untouched and preserves travel velocity', () => {
  const { camera, target, motion } = rig()
  motion.focus(new Vector3(35, 0.5, 20), 5)
  for (let i = 0; i < 8; i++) motion.step(1 / 60)
  const before = camera.position.clone(), beforeTarget = target.clone()
  const velocity = motion.velocity.clone(), zoomVelocity = motion.zoomVelocity
  const destination = new Vector3(-15, 0.3, 8)
  motion.focus(destination, 9)
  near(camera.position, before)
  near(target, beforeTarget)
  near(motion.velocity, velocity)
  assert.equal(motion.zoomVelocity, zoomVelocity)
  const dt = 1e-6
  motion.step(dt)
  near(target.clone().sub(beforeTarget).divideScalar(dt), velocity, 0.01)
  settle(motion)
  near(target, destination)
})

check('The spring gives the same pose at 30, 60 and 144 FPS', () => {
  const poses = [30, 60, 144].map(fps => {
    const { camera, target, motion } = rig()
    motion.focus(new Vector3(20, 1, -9), 4)
    for (let i = 0; i < fps / 2; i++) motion.step(1 / fps)
    return { position: camera.position.clone(), target: target.clone() }
  })
  for (const pose of poses.slice(1)) { near(pose.position, poses[0].position); near(pose.target, poses[0].target) }
})

check('Manual control cancels motion and the next focus reads the new orbit', () => {
  const { camera, target, motion } = rig()
  motion.focus(new Vector3(25, 0, 5), 4)
  motion.step(0.1)
  motion.stop()
  target.set(8, 0.3, -4)
  const direction = new Vector3(0.7, 0.9, -0.8).normalize()
  camera.position.copy(target).addScaledVector(direction, 12)
  const manualPose = camera.position.clone()
  motion.step(1)
  near(camera.position, manualPose)
  motion.focus(new Vector3(-10, 0.5, 11), 6)
  settle(motion)
  near(camera.position.clone().sub(target).normalize(), direction)
})

check('Reduced motion settles immediately, including a preference change mid-flight', () => {
  const { target, motion } = rig()
  const destination = new Vector3(-6, 1, 9)
  motion.focus(destination, 6, true)
  near(target, destination)
  assert.ok(!motion.active)
  motion.focus(new Vector3(16, 0.3, -7), 3)
  motion.step(0.05)
  motion.finish()
  near(target, new Vector3(16, 0.3, -7))
  assert.ok(!motion.active)
})

check('Rapid opposite selections keep zoom within the control limits', () => {
  const { camera, target, motion } = rig()
  for (let i = 0; i < 60; i++) {
    motion.focus(new Vector3(i % 2 ? 40 : -40, 0, i % 3 ? 10 : -10), i % 2 ? 0.1 : 500)
    for (let j = 0; j < 4; j++) {
      motion.step(1 / 60)
      assert.ok(Number.isFinite(camera.position.length()))
      assert.ok(camera.position.distanceTo(target) >= 1.5 - 1e-8)
      assert.ok(camera.position.distanceTo(target) <= 270 + 1e-8)
    }
  }
  settle(motion)
})

check('Zoom buttons leave the live pose untouched and advance smoothly along its orbit', () => {
  const { camera, target, motion } = rig()
  const position = camera.position.clone(), centre = target.clone()
  const start = camera.position.distanceTo(target)
  const direction = camera.position.clone().sub(target).normalize()
  motion.zoomBy(.78)
  near(camera.position, position)
  near(target, centre)
  assert.ok(motion.zooming && !motion.focusing)
  motion.step(1 / 60)
  const intermediate = camera.position.distanceTo(target)
  assert.ok(intermediate < start && intermediate > start * .78)
  near(camera.position.clone().sub(target).normalize(), direction)
  settle(motion)
  near(target, centre)
  assert.ok(Math.abs(camera.position.distanceTo(target) - start * .78) < 1e-8)
})

check('Rapid zoom presses accumulate distance without resetting position or velocity', () => {
  const { camera, target, motion } = rig()
  const start = camera.position.distanceTo(target)
  motion.zoomBy(.78)
  motion.step(.06)
  const position = camera.position.clone(), velocity = motion.zoomVelocity
  motion.zoomBy(.78)
  near(camera.position, position)
  assert.equal(motion.zoomVelocity, velocity)
  motion.step(1e-6)
  assert.ok(Math.abs((Math.log(camera.position.distanceTo(target)) - Math.log(position.distanceTo(target))) / 1e-6 - velocity) < .001)
  settle(motion)
  assert.ok(Math.abs(camera.position.distanceTo(target) - start * .78 ** 2) < 1e-8)
})

check('Zoom during a city flight starts from the current position and holds its current centre', () => {
  const { camera, target, motion } = rig()
  motion.focus(new Vector3(35, .5, 20), 5)
  motion.step(.15)
  const position = camera.position.clone(), centre = target.clone(), radius = position.distanceTo(centre)
  motion.zoomBy(1.28)
  near(camera.position, position)
  assert.ok(!motion.focusing)
  settle(motion)
  near(target, centre)
  assert.ok(Math.abs(camera.position.distanceTo(target) - radius * 1.28) < 1e-8)
})

check('Manual interruption makes the next zoom read the newly rotated and panned pose', () => {
  const { camera, target, motion } = rig()
  motion.zoomBy(.78)
  motion.step(.1)
  motion.stop()
  target.set(5, .7, -8)
  const direction = new Vector3(-.6, .7, -.4).normalize()
  camera.position.copy(target).addScaledVector(direction, 14)
  const position = camera.position.clone(), centre = target.clone()
  motion.zoomBy(1.28)
  near(camera.position, position)
  settle(motion)
  near(target, centre)
  near(camera.position.clone().sub(target).normalize(), direction)
  assert.ok(Math.abs(camera.position.distanceTo(target) - 14 * 1.28) < 1e-8)
})

check('Zoom remains consistent across frame rates and respects distance and reduced-motion limits', () => {
  const poses = [30, 60, 144].map(fps => {
    const { camera, motion } = rig()
    motion.zoomBy(.78)
    for (let i = 0; i < fps / 4; i++) motion.step(.25 / Math.ceil(fps / 4))
    return camera.position.clone()
  })
  poses.slice(1).forEach(pose => near(pose, poses[0]))
  const { camera, target, motion } = rig()
  for (const factor of [.0001, 10000]) {
    motion.zoomBy(factor)
    settle(motion)
    assert.ok(camera.position.distanceTo(target) >= 1.5 - 1e-8 && camera.position.distanceTo(target) <= 270 + 1e-8)
  }
  motion.zoomBy(.78, true)
  assert.ok(!motion.active)
  assert.ok(Math.abs(camera.position.distanceTo(target) - 270 * .78) < 1e-8)
})

const geo = JSON.parse(await readFile(new URL('../public/geo/cities.json', import.meta.url), 'utf8'))
const manifest = JSON.parse(await readFile(new URL('../public/geo/terrain/manifest.json', import.meta.url), 'utf8'))
const mercator = v => Math.log(Math.tan(Math.PI / 4 + v * Math.PI / 360)) * 180 / Math.PI
const heightScale = 1.12 / (111320 * Math.cos(36 * Math.PI / 180)) * 24
check('All 60 cities fit their real bounds from rotated, shallow and portrait views', () => {
  let cases = 0
  for (const feature of geo.features) {
    const info = manifest.cities[feature.properties.name]
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates
    const bounds = new Box3()
    for (const polygon of polygons) for (const [lng, lat] of polygon[0]) {
      bounds.expandByPoint(new Vector3((lng - 104.5) * 1.12, 0, -(mercator(lat) - mercator(36)) * 1.12))
    }
    bounds.min.y = (0.12 + info.minElevation * heightScale) * 0.25
    bounds.max.y = (0.12 + info.maxElevation * heightScale) * 0.25
    const target = bounds.getCenter(new Vector3())
    for (const aspect of [0.55, 1.15, 2.1]) for (const azimuth of [-2.6, -0.5, 1.8]) for (const polar of [0.2, 0.8, Math.PI / 2.65]) {
      const camera = new PerspectiveCamera(40, aspect, 0.1, 400)
      const direction = new Vector3(Math.sin(polar) * Math.sin(azimuth), Math.cos(polar), Math.sin(polar) * Math.cos(azimuth))
      const distance = fitMapDistance(camera, bounds, target, direction)
      assert.ok(distance <= 270, `${feature.properties.name} cannot fit within the zoom limits`)
      camera.position.copy(target).addScaledVector(direction, Math.max(1.5, distance))
      camera.lookAt(target)
      camera.updateMatrixWorld()
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const projected = new Vector3(x, y, z).project(camera)
        assert.ok(Math.abs(projected.x) <= 1 / 1.2 + 1e-8 && Math.abs(projected.y) <= 1 / 1.2 + 1e-8, `${feature.properties.name}: clipped bounds ${projected.toArray()}`)
        assert.ok(projected.z >= -1 && projected.z <= 1)
      }
      cases++
    }
  }
  console.log(`  ${cases} real-city/view combinations`)
})

console.log(`SUMMARY ${checks}/${checks}`)
