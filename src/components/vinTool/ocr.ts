import type { Worker } from 'tesseract.js'

const CHAR_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -:#/.'

const MAX_LONG_SIDE = 2000
const MIN_WIDTH = 1200

type ProgressListener = (status: string, progress: number) => void

let workerPromise: Promise<Worker> | null = null
let progressListener: ProgressListener | null = null

// tesseract.js is loaded on demand so it stays out of the main bundle; only a
// photo scan pulls it in.
async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = import('tesseract.js')
      .then(({ createWorker }) =>
        createWorker('eng', undefined, {
          logger: (msg) => progressListener?.(msg.status, msg.progress),
        }),
      )
      .then(async (worker) => {
        await worker.setParameters({ tessedit_char_whitelist: CHAR_WHITELIST })
        return worker
      })
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

export async function recognizeText(image: HTMLCanvasElement, onProgress: ProgressListener): Promise<string> {
  progressListener = onProgress
  try {
    const worker = await getWorker()
    const result = await worker.recognize(image)
    return result.data.text
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
