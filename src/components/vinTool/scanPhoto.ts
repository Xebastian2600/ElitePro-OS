import { findVins, type VinCandidate } from '../../vin/extract.ts'
import { preprocessImage, recognizeText, rotateImage, scaleImage, type ImageSource, type OcrMode, type Rotation } from './ocr.ts'

export type { ImageSource, OcrMode } from './ocr.ts'

// Sideways (90/270) is the common phone-photo mistake; fully upside-down (180) is rarer,
// so it's tried last to keep the common case cheap.
export const ROTATION_ORDER: readonly Rotation[] = [0, 90, 270, 180]

// Below this, tesseract's own signal says the page didn't read cleanly enough to trust
// even a check-digit-valid match (a short garbage string can pass the check digit by luck).
export const MIN_CONFIDENCE = 40

// Re-tried once at this scale when the best orientation found a 17-character run but
// couldn't confirm it — cheaper than always OCR'ing every rotation at high resolution.
const RETRY_SCALE = 1.6

export interface OrientationPass {
  degrees: Rotation
  confidence: number
  candidates: VinCandidate[]
}

function isGoodPass(pass: OrientationPass): boolean {
  return pass.confidence >= MIN_CONFIDENCE && pass.candidates.some((c) => c.checkDigitValid)
}

// Picks one orientation's candidates rather than pooling candidates across orientations,
// so a false positive from a garbage reading of an unrelated rotation can't leak in
// alongside a correct hit from another.
export function pickBestPass(passes: OrientationPass[]): OrientationPass {
  const good = passes.find(isGoodPass)
  if (good) return good

  // Among the rest, prefer a pass that found a 17-character run over one that found
  // nothing (the hi-res retry can score higher while finding zero, wiping out an
  // earlier pass's real-but-unconfirmed candidate). Only readable passes qualify:
  // a garbage orientation can produce a run that passes the check digit by luck.
  const withCandidates = passes.filter((pass) => pass.confidence >= MIN_CONFIDENCE && pass.candidates.length > 0)
  const pool = withCandidates.length > 0 ? withCandidates : passes
  return pool.reduce((best, pass) => (pass.confidence > best.confidence ? pass : best))
}

export type ScanProgressListener = (label: string, progress: number) => void

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')
}

function passLabel(degrees: Rotation, status: string, retry: boolean): string {
  if (retry) return `Rereading at higher resolution: ${formatStatus(status)}`
  return degrees === 0 ? formatStatus(status) : `Trying rotated ${degrees}°: ${formatStatus(status)}`
}

async function runPass(
  image: HTMLCanvasElement,
  degrees: Rotation,
  onProgress: ScanProgressListener,
  retry = false,
): Promise<OrientationPass> {
  const { text, confidence } = await recognizeText(image, (status, progress) => {
    onProgress(passLabel(degrees, status, retry), progress)
  })
  return { degrees, confidence, candidates: findVins(text) }
}

export interface ScanOptions {
  mode?: OcrMode
}

// Runs OCR at 0° first and stops as soon as an orientation yields a confident,
// check-digit-valid VIN. If nothing does, the most promising orientation (the one that
// found a 17-character run, even an unconfirmed one) gets one retry at higher resolution
// before giving up — this is what recovers a VIN lost to a single ambiguous character
// (e.g. "J" misread as "7") without paying the extra cost on every photo.
export async function scanPhotoForVin(
  input: ImageSource,
  onProgress: ScanProgressListener,
  options: ScanOptions = {},
): Promise<VinCandidate[]> {
  const mode = options.mode ?? 'photo'
  const preprocessed = preprocessImage(input, mode)
  const passes: OrientationPass[] = []

  for (const degrees of ROTATION_ORDER) {
    const pass = await runPass(rotateImage(preprocessed, degrees), degrees, onProgress)
    passes.push(pass)
    if (isGoodPass(pass)) return pass.candidates
  }

  const best = pickBestPass(passes)
  if (best.candidates.length === 0) return best.candidates

  const upscaled = scaleImage(rotateImage(preprocessed, best.degrees), RETRY_SCALE)
  const retryPass = await runPass(upscaled, best.degrees, onProgress, true)

  return pickBestPass([...passes, retryPass]).candidates
}
