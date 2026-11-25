import type { BoundingBox, FaceDetector } from '@mediapipe/tasks-vision'

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm'
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'
const ACQUIRE_FACE_SIZE = 0.15
const KEEP_FACE_SIZE = 0.10
const ACQUIRE_CONFIDENCE = 0.7
const KEEP_CONFIDENCE = 0.6
const CONFIRMATION_FRAMES = 3
const TRACKING_GRACE_MS = 250
const PREVIEW_ASPECT_RATIO = 4 / 3

export interface TrackedFace {
  size: number
  detectedAt: number
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
  let pendingFace: { position: number; frames: number; detectedAt: number } | null = null

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
        minDetectionConfidence: KEEP_CONFIDENCE,
      })
      if (signal.aborted) return stop()
      onFace(null)
      timer = window.setInterval(() => {
        const now = performance.now()
        try {
          if (detector && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime
            const frameWidth = video.videoWidth
            const frameHeight = video.videoHeight
            const frameArea = frameWidth * frameHeight
            // Match the centered object-cover crop used by the camera preview.
            const visibleWidth = Math.min(frameWidth, frameHeight * PREVIEW_ASPECT_RATIO)
            const visibleHeight = Math.min(frameHeight, frameWidth / PREVIEW_ASPECT_RATIO)
            const cropLeft = (frameWidth - visibleWidth) / 2
            const cropTop = (frameHeight - visibleHeight) / 2
            const previousFace = now - lastFace < TRACKING_GRACE_MS ? face : null
            let largestArea = 0
            let box: BoundingBox | undefined
            for (const { boundingBox, categories } of detector.detectForVideo(video, now).detections) {
              if (!boundingBox || !frameArea) continue
              const confidence = categories[0]?.score ?? 0
              if (confidence < (previousFace ? KEEP_CONFIDENCE : ACQUIRE_CONFIDENCE)) continue
              const x = boundingBox.originX + boundingBox.width / 2
              const y = boundingBox.originY + boundingBox.height / 2
              if (x < cropLeft || x > cropLeft + visibleWidth || y < cropTop || y > cropTop + visibleHeight) continue
              const position = (x - cropLeft) / visibleWidth
              const area = boundingBox.width * boundingBox.height
              const size = Math.sqrt(area / frameArea)
              if (previousFace) {
                if (size < Math.max(KEEP_FACE_SIZE, previousFace.size * 0.65) ||
                  Math.abs(position - previousFace.horizontalPosition) > 0.2) continue
              } else if (size < ACQUIRE_FACE_SIZE) {
                continue
              }
              if (area > largestArea) {
                largestArea = area
                box = boundingBox
              }
            }
            if (box && frameWidth > 0 && frameHeight > 0) {
              const position = (box.originX + box.width / 2 - cropLeft) / visibleWidth
              if (!previousFace) {
                const consistent = pendingFace && now - pendingFace.detectedAt < TRACKING_GRACE_MS &&
                  Math.abs(position - pendingFace.position) <= 0.1
                pendingFace = { position, frames: consistent ? (pendingFace?.frames ?? 0) + 1 : 1, detectedAt: now }
                if (pendingFace.frames < CONFIRMATION_FRAMES) {
                  onFace(null)
                  return
                }
              }
              pendingFace = null
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
                detectedAt: now,
                frameWidth,
                frameHeight,
                size: Math.sqrt(largestArea / (frameWidth * frameHeight)),
                horizontalPosition: position,
              }
            } else {
              pendingFace = null
            }
          }
          onFace(now - lastFace < TRACKING_GRACE_MS ? face : null)
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
