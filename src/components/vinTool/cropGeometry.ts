export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

// Below this (in either axis) a drag reads as an accidental tap/click rather than
// a deliberate selection.
export const MIN_DRAG_SIZE = 8

// A drag can run in any direction (including up and/or left of the start point);
// this turns the two raw points into a rect with a non-negative width and height.
export function normalizeRect(start: Point, end: Point): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}

// Clamps a rect so it sits fully inside [0, bounds.width] x [0, bounds.height] —
// a drag that runs past the edge of the image gets cut off there instead of
// selecting past what's actually in the photo.
export function clampRect(rect: Rect, bounds: Size): Rect {
  // Clamp both edges independently (not just the origin + width) so a rect that
  // starts off-bounds gets its width cut down to what's actually still inside.
  const left = Math.min(Math.max(rect.x, 0), bounds.width)
  const top = Math.min(Math.max(rect.y, 0), bounds.height)
  const right = Math.min(Math.max(rect.x + rect.width, 0), bounds.width)
  const bottom = Math.min(Math.max(rect.y + rect.height, 0), bounds.height)
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  }
}

export function isRectTooSmall(rect: Rect, minSize: number = MIN_DRAG_SIZE): boolean {
  return rect.width < minSize || rect.height < minSize
}

// Maps a rect from the rendered (on-screen, CSS pixel) image box to the image's
// natural pixel grid, so a crop drawn on a scaled-down preview lands on the right
// pixels of the full-resolution source. The preview <img> has no fixed height or
// object-fit today, so the browser scales it uniformly (no letterboxing) — but
// scaling x/y independently here keeps this correct even if that changes to an
// object-fit that can introduce different x/y scale factors while still filling
// the box (e.g. "fill").
export function displayedToNaturalRect(rect: Rect, displayed: Size, natural: Size): Rect {
  const scaleX = displayed.width === 0 ? 1 : natural.width / displayed.width
  const scaleY = displayed.height === 0 ? 1 : natural.height / displayed.height
  return {
    x: rect.x * scaleX,
    y: rect.y * scaleY,
    width: rect.width * scaleX,
    height: rect.height * scaleY,
  }
}

export interface PadRectOptions {
  // Proportional margin, as a fraction of the rect's shorter side.
  fraction?: number
  // A floor on the padded rect's shorter side, in source pixels — a fraction-only
  // pad barely helps a razor-tight selection (25% of an already-tiny short side is
  // still tiny), and the short side is what stands in for character/line height
  // here, so it's what actually needs real pixels to recognize confidently.
  minShortSide?: number
}

// Expands a crop outward on every edge before it's rasterized for OCR — a box
// drawn razor-tight against the characters starves tesseract of the quiet
// margin it wants and crops off the edge anti-aliasing tesseract uses to tell
// strokes apart. Pulling in real neighboring photo pixels (rather than just
// upscaling what's already there) also adds actual information, not just
// interpolation. Clamped to the photo's bounds, so a selection already at the
// edge simply gets less padding on that side.
export function padRectForOcr(rect: Rect, bounds: Size, options: PadRectOptions = {}): Rect {
  const { fraction = 0.25, minShortSide = 90 } = options
  const shortSide = Math.min(rect.width, rect.height)
  const proportionalPad = shortSide * fraction
  const padForMinimum = Math.max(0, minShortSide - shortSide) / 2
  const pad = Math.max(proportionalPad, padForMinimum)
  return clampRect({ x: rect.x - pad, y: rect.y - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }, bounds)
}

// The rectangles outside `rect` but inside `bounds` — used to dim everything except
// the current selection. Returns background-colored blocks rather than a box-shadow
// "hole" so the dimming stays within the design system's no-shadows rule.
export function outsideDimRects(rect: Rect, bounds: Size): Rect[] {
  const rects: Rect[] = []
  const rectRight = rect.x + rect.width
  const rectBottom = rect.y + rect.height

  if (rect.y > 0) rects.push({ x: 0, y: 0, width: bounds.width, height: rect.y })
  if (rectBottom < bounds.height) rects.push({ x: 0, y: rectBottom, width: bounds.width, height: bounds.height - rectBottom })
  if (rect.x > 0) rects.push({ x: 0, y: rect.y, width: rect.x, height: rect.height })
  if (rectRight < bounds.width) rects.push({ x: rectRight, y: rect.y, width: bounds.width - rectRight, height: rect.height })

  return rects
}
