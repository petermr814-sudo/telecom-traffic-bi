import { Box3, MathUtils, PerspectiveCamera, Vector3 } from 'three'

// A relaxed response: most of the move takes about a second, with a soft finish.
export const MAP_FOCUS_RESPONSE = 5.5
const MAP_ZOOM_RESPONSE = 12
const WORLD_UP = new Vector3(0, 1, 0)

/** Fit the bounds in the current viewing direction, including their depth. */
export function fitMapDistance(camera: PerspectiveCamera, bounds: Box3, target: Vector3, direction: Vector3, padding = 1.2) {
  const right = new Vector3().crossVectors(WORLD_UP, direction).normalize()
  const up = new Vector3().crossVectors(direction, right).normalize()
  const tanVertical = Math.tan(MathUtils.degToRad(camera.getEffectiveFOV()) / 2)
  const tanHorizontal = tanVertical * camera.aspect
  const offset = new Vector3()
  let distance = 0
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        offset.set(x, y, z).sub(target)
        const depth = offset.dot(direction)
        distance = Math.max(distance, depth + Math.max(
          Math.abs(offset.dot(right)) * padding / tanHorizontal,
          Math.abs(offset.dot(up)) * padding / tanVertical,
          camera.near * 2
        ))
      }
    }
  }
  return distance
}

/** Live orbit state, with a critically damped target and logarithmic zoom. */
export class MapCameraMotion {
  private camera: PerspectiveCamera
  private lookAt: Vector3
  private minDistance: number
  private maxDistance: number
  private goal = new Vector3()
  private direction = new Vector3()
  private velocity = new Vector3()
  private delta = new Vector3()
  private impulse = new Vector3()
  private goalZoom = 0
  private zoom = 0
  private zoomVelocity = 0
  private mode: 'focus' | 'zoom' = 'focus'
  active = false

  get focusing() { return this.active && this.mode === 'focus' }
  get zooming() { return this.active && this.mode === 'zoom' }

  constructor(camera: PerspectiveCamera, lookAt: Vector3, minDistance: number, maxDistance: number) {
    this.camera = camera
    this.lookAt = lookAt
    this.minDistance = minDistance
    this.maxDistance = maxDistance
  }

  focus(target: Vector3, distance: number, instant = false) {
    // Read the actual camera, including a user's drag or an unfinished flight.
    // Retargeting keeps velocity; it never rewinds to an old starting keyframe.
    this.direction.copy(this.camera.position).sub(this.lookAt)
    const radius = this.direction.length()
    if (radius < 1e-6) this.direction.set(0, 1, 1).normalize()
    else this.direction.divideScalar(radius)
    this.zoom = Math.log(MathUtils.clamp(radius, this.minDistance, this.maxDistance))
    this.goal.copy(target)
    this.goalZoom = Math.log(MathUtils.clamp(distance, this.minDistance, this.maxDistance))
    this.mode = 'focus'
    if (instant) this.finish()
    else this.active = true
  }

  zoomBy(factor: number, instant = false) {
    if (!Number.isFinite(factor) || factor <= 0) return
    // Always start at the live pose. Rapid presses extend the pending distance,
    // preserving velocity while keeping the current orbit centre and direction.
    this.direction.copy(this.camera.position).sub(this.lookAt)
    const radius = this.direction.length()
    if (radius < 1e-6) this.direction.set(0, 1, 1).normalize()
    else this.direction.divideScalar(radius)
    const nextDistance = (this.zooming ? Math.exp(this.goalZoom) : radius) * factor
    this.zoom = Math.log(MathUtils.clamp(radius, this.minDistance, this.maxDistance))
    this.goalZoom = Math.log(MathUtils.clamp(nextDistance, this.minDistance, this.maxDistance))
    this.goal.copy(this.lookAt)
    this.velocity.set(0, 0, 0)
    this.mode = 'zoom'
    if (instant) this.finish()
    else this.active = true
  }

  step(dt: number) {
    if (!this.active || dt <= 0) return
    // Exact critical-spring integration stays consistent at different frame rates.
    const response = this.mode === 'zoom' ? MAP_ZOOM_RESPONSE : MAP_FOCUS_RESPONSE
    const decay = Math.exp(-response * dt)
    this.delta.copy(this.lookAt).sub(this.goal)
    this.impulse.copy(this.delta).multiplyScalar(response).add(this.velocity)
    this.lookAt.copy(this.goal).addScaledVector(this.delta, decay).addScaledVector(this.impulse, dt * decay)
    this.velocity.addScaledVector(this.impulse, -response * dt).multiplyScalar(decay)
    const zoomDelta = this.zoom - this.goalZoom
    const zoomImpulse = this.zoomVelocity + response * zoomDelta
    this.zoom = this.goalZoom + (zoomDelta + zoomImpulse * dt) * decay
    this.zoomVelocity = (this.zoomVelocity - response * zoomImpulse * dt) * decay
    const radius = MathUtils.clamp(Math.exp(this.zoom), this.minDistance, this.maxDistance)
    if (radius !== Math.exp(this.zoom)) {
      this.zoom = Math.log(radius)
      this.zoomVelocity = 0
    }
    this.camera.position.copy(this.lookAt).addScaledVector(this.direction, radius)
    const tolerance = Math.max(0.001, Math.exp(this.goalZoom) * 0.0005)
    if (this.lookAt.distanceTo(this.goal) < tolerance && this.velocity.length() < tolerance * response
      && Math.abs(this.zoom - this.goalZoom) < 0.0005 && Math.abs(this.zoomVelocity) < 0.0005 * response) this.finish()
  }

  finish() {
    this.lookAt.copy(this.goal)
    this.camera.position.copy(this.lookAt).addScaledVector(this.direction, Math.exp(this.goalZoom))
    this.stop()
  }

  stop() {
    this.active = false
    this.velocity.set(0, 0, 0)
    this.zoomVelocity = 0
  }
}
