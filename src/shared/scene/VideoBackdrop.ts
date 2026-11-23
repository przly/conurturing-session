import * as THREE from 'three'

export interface VideoBackdropOptions {
  video: HTMLVideoElement
  blurPx: number
  contrast: number
  opacity: number
  textureWidth: number
  getPreviewPosition?: () => number | null
}

/** A soft video plane behind the stage, in the same render pass as the plant and weather. */
export class VideoBackdrop {
  private readonly canvas = document.createElement('canvas')
  private readonly context = this.canvas.getContext('2d')
  private readonly texture: THREE.VideoTexture
  private readonly previewTexture = new THREE.CanvasTexture(this.canvas)
  private readonly geometry = new THREE.PlaneGeometry(1, 1)
  private readonly material: THREE.MeshBasicMaterial
  readonly mesh: THREE.Mesh
  private previewPosition: number | null = null
  private uploaded = false
  /** A paused video presents no new frames, so the texture is refreshed by hand after a seek. */
  private readonly refresh = () => { this.texture.needsUpdate = true }

  private readonly options: VideoBackdropOptions

  constructor(options: VideoBackdropOptions) {
    this.options = options
    this.texture = new THREE.VideoTexture(options.video)
    this.previewTexture.colorSpace = THREE.SRGBColorSpace
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture, opacity: options.opacity, transparent: true, depthWrite: false, fog: false, toneMapped: false,
    })
    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.position.z = -18
    this.mesh.renderOrder = -1
    this.mesh.visible = false
    options.video.addEventListener('seeked', this.refresh)
    options.video.addEventListener('loadeddata', this.refresh)
  }

  update(camera: THREE.PerspectiveCamera, viewportWidth: number) {
    const { video, textureWidth, blurPx, contrast } = this.options
    if (video.readyState < 2 || !viewportWidth) return
    if (!this.uploaded) {
      // A video that is already paused on a decoded frame (no new frames coming) still needs one upload.
      this.uploaded = true
      this.texture.needsUpdate = true
    }
    const height = 2 * Math.abs(this.mesh.position.z) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const videoAspect = video.videoWidth / video.videoHeight
    const width = height * Math.max(camera.aspect, videoAspect)
    this.mesh.scale.set(width, width / videoAspect, 1)
    const previewPosition = this.options.getPreviewPosition?.() ?? null
    this.mesh.visible = true
    if (previewPosition === null || !this.context) {
      this.material.map = this.texture
      this.previewPosition = null
      return
    }
    this.material.map = this.previewTexture
    if (this.previewPosition === previewPosition) return
    this.previewPosition = previewPosition
    this.canvas.width = textureWidth
    this.canvas.height = Math.round(textureWidth / videoAspect)
    const blur = blurPx * textureWidth / (viewportWidth * Math.max(1, videoAspect / camera.aspect))
    this.context.filter = `blur(${blur}px) grayscale(1) contrast(${contrast})`
    const x = this.canvas.width * (0.5 + (previewPosition - 0.5) * Math.min(1, camera.aspect / videoAspect))
    const h = this.canvas.height
    this.context.fillStyle = '#808080'
    this.context.beginPath()
    this.context.ellipse(x, h * 0.26, h * 0.073, h * 0.09, 0, 0, Math.PI * 2)
    this.context.roundRect(x - h * 0.15, h * 0.35, h * 0.3, h * 0.85, h * 0.11)
    this.context.fill()
    this.previewTexture.needsUpdate = true
  }

  dispose() {
    this.options.video.removeEventListener('seeked', this.refresh)
    this.options.video.removeEventListener('loadeddata', this.refresh)
    this.geometry.dispose()
    this.material.dispose()
    this.previewTexture.dispose()
    this.texture.dispose()
  }
}
