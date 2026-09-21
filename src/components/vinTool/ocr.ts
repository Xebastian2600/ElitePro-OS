import type { Worker } from 'tesseract.js'
import { cropScaleFactor, shouldInvert } from './ocrTuning.ts'

const CHAR_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -:#/.'

const MAX_LONG_SIDE = 2000
const MIN_WIDTH = 1200

export type Rotation = 0 | 90 | 180 | 270

// 'photo' preserves the original whole-image preprocessing (scale by width,
// layout analysis via PSM.AUTO). 'crop' is a user-drawn selection — usually one
// text line at an unknown scale, so it gets its own scale target and a
// single-line page segmentation mode instead.
export type OcrMode = 'photo' | 'crop'

// A drawable source plus its own pixel size — width/height come along explicitly
// because not every CanvasImageSource (e.g. a cropped canvas) exposes natural
// dimensions the same way an <img> does.
export interface ImageSource {
  source: CanvasImageSource
  width: number
  height: number
}

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
          // Measured PSM.SINGLE_LINE/SINGLE_BLOCK against real crops (a user's
          // selection box usually still has a neighboring line or two inside the
          // padded/rotated crop) and both did worse than AUTO, so crops use the
          // same layout analysis as whole photos — only the scale/polarity step
          // in preprocessImage is crop-specific.
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

// Grayscale + resize toward tesseract's sweet spot for character resolution, then
// (crop mode only) invert light-on-dark text to dark-on-light. Takes an
// explicit-size source (rather than an HTMLImageElement) so the same pipeline
// runs on a cropped selection's canvas, not just a whole decoded photo.
export function preprocessImage(input: ImageSource, mode: OcrMode = 'photo'): HTMLCanvasElement {
  const { source, width: sourceWidth, height: sourceHeight } = input

  const scale = mode === 'crop' ? cropScaleFactor(sourceWidth, sourceHeight) : photoScaleFactor(sourceWidth, sourceHeight)

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
  let luminanceSum = 0
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    data[i] = gray
    data[i + 1] = gray
    data[i + 2] = gray
    luminanceSum += gray
  }

  // A whole photo can legitimately be either polarity (a window sticker vs. a
  // dark under-hood label), and we don't have a broad enough test set to trust
  // auto-inverting it — but a crop the user just drew around a VIN is a small
  // enough, well-isolated sample that the mean is a reliable signal.
  if (mode === 'crop') {
    const pixelCount = data.length / 4
    const mean = pixelCount > 0 ? luminanceSum / pixelCount : 255
    if (shouldInvert(mean)) {
      for (let i = 0; i < data.length; i += 4) {
        const inverted = 255 - data[i]
        data[i] = inverted
        data[i + 1] = inverted
        data[i + 2] = inverted
      }
    }
  }

  ctx.putImageData(imageData, 0, 0)

  return canvas
}

function photoScaleFactor(width: number, height: number): number {
  const longSide = Math.max(width, height)
  let scale = width < MIN_WIDTH ? MIN_WIDTH / width : 1
  if (longSide * scale > MAX_LONG_SIDE) {
    scale = MAX_LONG_SIDE / longSide
  }
  return scale
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
