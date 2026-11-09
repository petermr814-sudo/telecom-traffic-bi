import { Box2, CanvasTexture, DataTexture, MeshStandardMaterial, Texture, Vector2, Vector4 } from 'three'

/** A contact shadow in terrain coordinates, following the actual city outline. */
export class TerrainSelectionShadow {
  private empty = new DataTexture(new Uint8Array(4), 1, 1)
  private texture: Texture | undefined
  private attached = new WeakSet<MeshStandardMaterial>()
  private uniforms = {
    mapSelectionShadow: { value: this.empty as Texture },
    mapSelectionBounds: { value: new Vector4(0, 0, 1, 1) },
    mapSelectionStrength: { value: 0 }
  }

  constructor() { this.empty.needsUpdate = true }

  attach(material: MeshStandardMaterial) {
    if (this.attached.has(material)) return
    this.attached.add(material)
    const uniforms = this.uniforms
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vMapSelectionPosition;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMapSelectionPosition = position.xz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D mapSelectionShadow;
          uniform vec4 mapSelectionBounds;
          uniform float mapSelectionStrength;
          varying vec2 vMapSelectionPosition;
        `)
        .replace('#include <color_fragment>', `#include <color_fragment>
          if (mapSelectionStrength > 0.0) {
            vec2 selectionUV = (vMapSelectionPosition - mapSelectionBounds.xy) / mapSelectionBounds.zw;
            float inShadowBounds = step(0.0, selectionUV.x) * step(selectionUV.x, 1.0)
              * step(0.0, selectionUV.y) * step(selectionUV.y, 1.0);
            float contactShadow = texture2D(mapSelectionShadow, clamp(selectionUV, 0.0, 1.0)).a * inShadowBounds;
            diffuseColor.rgb *= 1.0 - contactShadow * mapSelectionStrength;
          }
        `)
    }
    material.customProgramCacheKey = () => 'terrain-selection-contact-shadow-v1'
    material.needsUpdate = true
  }

  setRegion(polygons: Vector2[][][]) {
    this.clear()
    const bounds = new Box2()
    for (const polygon of polygons) for (const ring of polygon) for (const point of ring) bounds.expandByPoint(point)
    if (bounds.isEmpty()) return
    const center = bounds.getCenter(new Vector2())
    const size = bounds.getSize(new Vector2())
    const span = Math.max(size.x, size.y, .01) * 1.3
    const west = center.x - span / 2, north = center.y - span / 2
    const resolution = 1024
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = resolution
    const ctx = canvas.getContext('2d')!
    const footprint = new Path2D()
    for (const polygon of polygons) for (const ring of polygon) {
      ring.forEach((point, index) => {
        const x = (point.x - west) / span * resolution
        const y = (point.y - north) / span * resolution
        if (index === 0) footprint.moveTo(x, y)
        else footprint.lineTo(x, y)
      })
      footprint.closePath()
    }
    ctx.fillStyle = '#fff'
    // Sunlight comes from the northwest: a soft southeast offset gives depth,
    // while the tighter ambient shadow keeps the contour readable on flat plains.
    ctx.shadowColor = 'rgba(0, 0, 0, .38)'
    ctx.shadowBlur = 24
    ctx.shadowOffsetX = 13
    ctx.shadowOffsetY = 17
    ctx.fill(footprint, 'evenodd')
    ctx.shadowColor = 'rgba(0, 0, 0, .5)'
    ctx.shadowBlur = 9
    ctx.shadowOffsetX = ctx.shadowOffsetY = 0
    ctx.fill(footprint, 'evenodd')
    // Retain only the outside shadow, including holes and disjoint islands.
    ctx.shadowColor = 'transparent'
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fill(footprint, 'evenodd')
    this.texture = new CanvasTexture(canvas)
    this.texture.flipY = false
    this.uniforms.mapSelectionShadow.value = this.texture
    this.uniforms.mapSelectionBounds.value.set(west, north, span, span)
    this.uniforms.mapSelectionStrength.value = .85
  }

  clear() {
    this.uniforms.mapSelectionStrength.value = 0
    this.uniforms.mapSelectionShadow.value = this.empty
    this.texture?.dispose()
    this.texture = undefined
  }

  dispose() { this.clear(); this.empty.dispose() }
}
