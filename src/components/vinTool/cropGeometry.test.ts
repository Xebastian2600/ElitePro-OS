import { describe, expect, it } from 'vitest'
import {
  clampRect,
  displayedToNaturalRect,
  isRectTooSmall,
  normalizeRect,
  outsideDimRects,
  padRectForOcr,
} from './cropGeometry.ts'

describe('normalizeRect', () => {
  it('normalizes a down-right drag', () => {
    expect(normalizeRect({ x: 10, y: 10 }, { x: 50, y: 40 })).toEqual({ x: 10, y: 10, width: 40, height: 30 })
  })

  it('normalizes an up-left drag', () => {
    expect(normalizeRect({ x: 50, y: 40 }, { x: 10, y: 10 })).toEqual({ x: 10, y: 10, width: 40, height: 30 })
  })

  it('normalizes a down-left drag', () => {
    expect(normalizeRect({ x: 50, y: 10 }, { x: 10, y: 40 })).toEqual({ x: 10, y: 10, width: 40, height: 30 })
  })

  it('normalizes an up-right drag', () => {
    expect(normalizeRect({ x: 10, y: 40 }, { x: 50, y: 10 })).toEqual({ x: 10, y: 10, width: 40, height: 30 })
  })
})

describe('clampRect', () => {
  const bounds = { width: 100, height: 80 }

  it('leaves a rect that already fits untouched', () => {
    expect(clampRect({ x: 10, y: 10, width: 20, height: 20 }, bounds)).toEqual({ x: 10, y: 10, width: 20, height: 20 })
  })

  it('cuts off a rect that runs past the right/bottom edges', () => {
    expect(clampRect({ x: 90, y: 70, width: 30, height: 30 }, bounds)).toEqual({ x: 90, y: 70, width: 10, height: 10 })
  })

  it('cuts off a rect that starts before the top/left edges', () => {
    expect(clampRect({ x: -20, y: -10, width: 40, height: 30 }, bounds)).toEqual({ x: 0, y: 0, width: 20, height: 20 })
  })

  it('collapses to zero size once the start point is entirely outside bounds', () => {
    expect(clampRect({ x: 150, y: 150, width: 10, height: 10 }, bounds)).toEqual({ x: 100, y: 80, width: 0, height: 0 })
  })
})

describe('isRectTooSmall', () => {
  it('flags a rect narrower than the minimum in either axis', () => {
    expect(isRectTooSmall({ x: 0, y: 0, width: 5, height: 50 })).toBe(true)
    expect(isRectTooSmall({ x: 0, y: 0, width: 50, height: 5 })).toBe(true)
  })

  it('accepts a rect at or above the minimum in both axes', () => {
    expect(isRectTooSmall({ x: 0, y: 0, width: 8, height: 8 })).toBe(false)
    expect(isRectTooSmall({ x: 0, y: 0, width: 50, height: 50 })).toBe(false)
  })

  it('honors a custom minimum', () => {
    expect(isRectTooSmall({ x: 0, y: 0, width: 12, height: 12 }, 20)).toBe(true)
  })
})

describe('displayedToNaturalRect', () => {
  it('scales a displayed rect up to the natural pixel grid', () => {
    const rect = { x: 10, y: 20, width: 30, height: 40 }
    const displayed = { width: 300, height: 400 }
    const natural = { width: 600, height: 800 }
    expect(displayedToNaturalRect(rect, displayed, natural)).toEqual({ x: 20, y: 40, width: 60, height: 80 })
  })

  it('is a no-op when displayed and natural sizes match', () => {
    const rect = { x: 5, y: 5, width: 10, height: 10 }
    const size = { width: 200, height: 200 }
    expect(displayedToNaturalRect(rect, size, size)).toEqual(rect)
  })
})

describe('outsideDimRects', () => {
  const bounds = { width: 100, height: 100 }

  it('returns four rects for a selection in the middle', () => {
    const rect = { x: 20, y: 30, width: 40, height: 20 }
    const dims = outsideDimRects(rect, bounds)
    expect(dims).toEqual([
      { x: 0, y: 0, width: 100, height: 30 }, // above
      { x: 0, y: 50, width: 100, height: 50 }, // below
      { x: 0, y: 30, width: 20, height: 20 }, // left
      { x: 60, y: 30, width: 40, height: 20 }, // right
    ])
  })

  it('omits the top rect when the selection is flush with the top edge', () => {
    const rect = { x: 20, y: 0, width: 40, height: 20 }
    const dims = outsideDimRects(rect, bounds)
    expect(dims.find((d) => d.width === bounds.width && d.y === 0)).toBeUndefined()
    expect(dims).toHaveLength(3)
  })

  it('returns no rects when the selection covers the full bounds', () => {
    expect(outsideDimRects({ x: 0, y: 0, width: 100, height: 100 }, bounds)).toEqual([])
  })
})

describe('padRectForOcr', () => {
  const bounds = { width: 1000, height: 1000 }

  it('uses the proportional pad when the rect is already reasonably sized', () => {
    const rect = { x: 50, y: 50, width: 200, height: 200 }
    // shortSide 200 * 0.25 = 50 pad, well above the 90px minShortSide floor
    expect(padRectForOcr(rect, bounds)).toEqual({ x: 0, y: 0, width: 300, height: 300 })
  })

  it('falls back to the minShortSide floor for a razor-tight rect', () => {
    const rect = { x: 100, y: 100, width: 30, height: 400 }
    // proportional pad (7.5) is far too small; the floor brings the short side up to 90
    const padded = padRectForOcr(rect, bounds)
    expect(padded).toEqual({ x: 70, y: 70, width: 90, height: 460 })
    expect(Math.min(padded.width, padded.height)).toBe(90)
  })

  it('clamps padding at a photo edge instead of padding symmetrically past it', () => {
    const rect = { x: 5, y: 5, width: 30, height: 400 }
    expect(padRectForOcr(rect, bounds)).toEqual({ x: 0, y: 0, width: 65, height: 435 })
  })

  it('honors custom fraction/minShortSide options', () => {
    const rect = { x: 0, y: 0, width: 100, height: 50 }
    expect(padRectForOcr(rect, { width: 200, height: 200 }, { fraction: 0.1, minShortSide: 0 })).toEqual({
      x: 0,
      y: 0,
      width: 105,
      height: 55,
    })
  })
})
