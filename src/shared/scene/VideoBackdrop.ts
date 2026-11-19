import * as THREE from 'three'

export interface VideoBackdropOptions {
  video: HTMLVideoElement
  blurPx: number
  contrast: number
  opacity: number
  textureWidth: number
}

/** A soft video plane behind the stage, in the same render pass as the plant and weather. */
export class VideoBackdrop {
  private readonly canvas = document.createElement('canvas')
  private readonly context = this.canvas.getContext('2d')
  private readonly texture = new THREE.CanvasTexture(this.canvas)
  private readonly geometry = new THREE.PlaneGeometry(1, 1)
  private readonly material: THREE.MeshBasicMaterial
  readonly mesh: THREE.Mesh
  private time = -1

  private readonly options: VideoBackdropOptions

  constructor(options: VideoBackdropOptions) {
    this.options = options
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture, opacity: options.opacity, transparent: true, depthWrite: false, fog: false, toneMapped: false,
    })
    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.position.z = -18
    this.mesh.renderOrder = -1
    this.mesh.visible = false
  }

  update(camera: THREE.PerspectiveCamera, viewportWidth: number) {
    const { video, textureWidth, blurPx, contrast } = this.options
    if (!this.context || video.readyState < 2 || !viewportWidth) return
    const height = 2 * Math.abs(this.mesh.position.z) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const videoAspect = video.videoWidth / video.videoHeight
    const width = height * Math.max(camera.aspect, videoAspect)
    this.mesh.scale.set(width, width / videoAspect, 1)
    if (this.time === video.currentTime) return
    this.time = video.currentTime
    this.canvas.width = textureWidth
    this.canvas.height = Math.round(textureWidth / videoAspect)
    const blur = blurPx * textureWidth / (viewportWidth * Math.max(1, videoAspect / camera.aspect))
    const bleed = Math.ceil(blur * 3)
    this.context.filter = `blur(${blur}px) grayscale(1) contrast(${contrast})`
    this.context.drawImage(video, -bleed, -bleed, this.canvas.width + 2 * bleed, this.canvas.height + 2 * bleed)
    this.texture.needsUpdate = true
    this.mesh.visible = true
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
    this.texture.dispose()
  }
}
