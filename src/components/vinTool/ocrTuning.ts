// Pure decision helpers for crop-scan OCR preprocessing, kept separate from the
// canvas/pixel code in ocr.ts so they're unit-testable without a DOM or tesseract.

// A crop's mean grayscale value (0-255) below this reads as light text on a dark
// background — inverting it to dark-on-light plays to tesseract's strength (it's
// trained mostly on dark text on a light page). Measured against
// kia-label-sideways.jpg (white text on a black VIN sticker): its crops average
// well under 100; a normal paper document averages well over 128.
const INVERT_LUMINANCE_THRESHOLD = 128

export function shouldInvert(meanLuminance: number): boolean {
  return meanLuminance < INVERT_LUMINANCE_THRESHOLD
}

// Targets the short side (== the text line's height — a crop is usually one
// line, and a 90/270 rotation just swaps which axis is "short") toward the
// resolution the whole-photo pipeline already reaches for this same label: at
// its MIN_WIDTH/MAX_LONG_SIDE scale, the VIN line's ~67px raw height becomes
// ~240px, which is what actually gets a confident read. Scaling a *crop* by
// MIN_WIDTH (whole-photo width) instead blows up its short axis by a much
// larger factor for no resolution gain, since MAX_LONG_SIDE then claws most of
// it back on the long axis — producing a blurrier image, not a sharper one.
const CROP_TARGET_SHORT_SIDE = 240
const CROP_MAX_LONG_SIDE = 2600

export function cropScaleFactor(width: number, height: number): number {
  const shortSide = Math.min(width, height)
  const longSide = Math.max(width, height)
  if (shortSide <= 0) return 1
  let scale = CROP_TARGET_SHORT_SIDE / shortSide
  if (longSide * scale > CROP_MAX_LONG_SIDE) scale = CROP_MAX_LONG_SIDE / longSide
  return Math.max(scale, 0.1)
}
