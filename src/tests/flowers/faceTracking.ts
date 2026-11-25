import type { BoundingBox, FaceDetector } from '@mediapipe/tasks-vision'

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm'
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'

export interface TrackedFace {
  size: number
  horizontalPosition: number
  headBox: Pick<BoundingBox, 'originX' | 'originY' | 'width' | 'height'>
  frameWidth: number
  frameHeight: number
}

export function startFaceTracking(
  video: HTMLVideoElement,
  signal: AbortSignal,
  onFace: (face: TrackedFace | null) => void,
  onError: (message: string) => void,
) {
  let stream: MediaStream | undefined
  let detector: FaceDetector | undefined
  let timer: number | undefined
  let lastVideoTime = -1
  let lastFace = -Infinity
  let face: TrackedFace | null = null

  const stop = () => {
    window.clearInterval(timer)
    detector?.close()
    detector = undefined
    stream?.getTracks().forEach((track) => track.stop())
    if (stream && video.srcObject === stream) video.srcObject = null
  }
  signal.addEventListener('abort', stop, { once: true })

  const fail = (message: string) => {
    stop()
    if (!signal.aborted) onError(message)
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      fail('Camera access requires HTTPS or localhost.')
      return
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      })
      if (signal.aborted) return stop()
      stream.getVideoTracks()[0]?.addEventListener('ended', () => fail('The camera disconnected.'), { once: true, signal })
      video.srcObject = stream
      await video.play()
    } catch {
      fail('Allow camera access and try again.')
      return
    }

    try {
      const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision')
      const files = await FilesetResolver.forVisionTasks(WASM)
      if (signal.aborted) return
      detector = await FaceDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.5,
      })
      if (signal.aborted) return stop()
      onFace(null)
      timer = window.setInterval(() => {
        const now = performance.now()
        try {
          if (detector && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime
            let largestArea = 0
            let box: BoundingBox | undefined
            for (const { boundingBox } of detector.detectForVideo(video, now).detections) {
              const area = boundingBox ? boundingBox.width * boundingBox.height : 0
              if (area > largestArea) {
                largestArea = area
                box = boundingBox
              }
            }
            const frameWidth = video.videoWidth
            const frameHeight = video.videoHeight
            if (box && frameWidth > 0 && frameHeight > 0) {
              lastFace = now
              // Square root converts the area fraction to a relative linear size.
              // Estimate the head from the face, with more room above for the forehead and hair.
              const headBox = {
                originX: box.originX - box.width * 0.15,
                originY: box.originY - box.height * 0.35,
                width: box.width * 1.3,
                height: box.height * 1.4,
              }
              face = {
                headBox,
                frameWidth,
                frameHeight,
                size: Math.sqrt(largestArea / (frameWidth * frameHeight)),
                horizontalPosition: (box.originX + box.width / 2) / frameWidth,
              }
            }
          }
          onFace(now - lastFace < 400 ? face : null)
        } catch {
          fail('Face tracking stopped. Try again.')
        }
      }, 100)
    } catch {
      fail('Face tracking failed to load. Try again.')
    }
  }

  void start()
}
