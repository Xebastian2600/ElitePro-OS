import type { Worker } from 'tesseract.js'

const CHAR_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -:#/.'

const MAX_LONG_SIDE = 2000
const MIN_WIDTH = 1200

export type Rotation = 0 | 90 | 180 | 270

type ProgressListener = (status: string, progress: number) => void

let workerPromise: Promise<Worker> | null = null
let progressListener: ProgressListener | null = null

// tesseract.js is loaded on demand so it stays out of the main bundle; only a
// photo scan pulls it in.
async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = import('tesseract.js')
      .then(({ createWorker, PSM }) =>
        createWorker('eng', undefined, {
          logger: (msg) => progressListener?.(msg.status, msg.progress),
        }).then(async (worker) => {
          // PSM.AUTO runs tesseract's layout analysis (line detection with skew
          // correction) instead of the SINGLE_BLOCK default, which treats the whole
          // image as one uniform paragraph and merges adjacent lines on any tilt —
          // that merging was swallowing the leading characters of the VIN line.
          await worker.setParameters({
            tessedit_char_whitelist: CHAR_WHITELIST,
            tessedit_pageseg_mode: PSM.AUTO,
          })
          return worker
        }),
      )
      .catch((err) => {
        workerPromise = null
        throw err
      })
  }
  return workerPromise
}

// Grayscale + resize toward tesseract's sweet spot for character resolution.
export function preprocessImage(source: HTMLImageElement): HTMLCanvasElement {
  const { naturalWidth: sourceWidth, naturalHeight: sourceHeight } = source
  const longSide = Math.max(sourceWidth, sourceHeight)

  let scale = sourceWidth < MIN_WIDTH ? MIN_WIDTH / sourceWidth : 1
  if (longSide * scale > MAX_LONG_SIDE) {
    scale = MAX_LONG_SIDE / longSide
  }

  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable.')

  ctx.drawImage(source, 0, 0, width, height)

  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    data[i] = gray
    data[i + 1] = gray
    data[i + 2] = gray
  }
  ctx.putImageData(imageData, 0, 0)

  return canvas
}

// The size a canvas would have after a multiple-of-90 rotation, without touching the DOM.
export function rotatedSize(width: number, height: number, degrees: Rotation): { width: number; height: number } {
  return degrees % 180 === 0 ? { width, height } : { width: height, height: width }
}

// Exact 0/1/-1 coefficients (rather than ctx.rotate with a floating-point angle) keep a
// 90/180/270 rotation a pure pixel remap with no resampling.
const ROTATION_TRANSFORM: Record<Exclude<Rotation, 0>, (w: number, h: number) => [number, number, number, number, number, number]> = {
  90: (_w, h) => [0, 1, -1, 0, h, 0],
  180: (w, h) => [-1, 0, 0, -1, w, h],
  270: (w, _h) => [0, -1, 1, 0, 0, w],
}

// Rotates by an exact multiple of 90 degrees, which is a lossless pixel remap (no resampling blur).
export function rotateImage(source: HTMLCanvasElement, degrees: Rotation): HTMLCanvasElement {
  if (degrees === 0) return source

  const { width, height } = rotatedSize(source.width, source.height, degrees)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable.')

  ctx.setTransform(...ROTATION_TRANSFORM[degrees](source.width, source.height))
  ctx.drawImage(source, 0, 0)

  return canvas
}

// Re-renders a canvas at a larger size — used for a one-shot higher-resolution retry when
// normal-resolution OCR didn't land a confident VIN.
export function scaleImage(source: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.width * factor))
  canvas.height = Math.max(1, Math.round(source.height * factor))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable.')
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

export interface RecognizeResult {
  text: string
  confidence: number
}

export async function recognizeText(image: HTMLCanvasElement, onProgress: ProgressListener): Promise<RecognizeResult> {
  progressListener = onProgress
  try {
    const worker = await getWorker()
    const result = await worker.recognize(image)
    return { text: result.data.text, confidence: result.data.confidence }
  } finally {
    progressListener = null
  }
}

export async function terminateOcrWorker(): Promise<void> {
  if (!workerPromise) return
  const promise = workerPromise
  workerPromise = null
  try {
    const worker = await promise
    await worker.terminate()
  } catch {
    // worker never finished initializing — nothing to terminate
  }
}
