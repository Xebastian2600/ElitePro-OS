import { describe, expect, it } from 'vitest'
import { cropScaleFactor, shouldInvert } from './ocrTuning.ts'

describe('shouldInvert', () => {
  it('inverts a mostly-dark image (light text on a dark background)', () => {
    expect(shouldInvert(40)).toBe(true) // e.g. kia-label-sideways.jpg's black sticker
  })

  it('does not invert a mostly-light image (normal dark-text-on-paper document)', () => {
    expect(shouldInvert(220)).toBe(false)
  })

  it('treats the midpoint as not needing inversion', () => {
    expect(shouldInvert(128)).toBe(false)
  })
})

describe('cropScaleFactor', () => {
  it('scales a narrow crop up so its short side reaches the target', () => {
    // short side 30, long side 150 (uncapped) -> scale to reach 240
    expect(cropScaleFactor(30, 150)).toBeCloseTo(240 / 30, 5)
  })

  it('is invariant to which axis is short (rotation just swaps width/height)', () => {
    expect(cropScaleFactor(30, 150)).toBeCloseTo(cropScaleFactor(150, 30), 5)
  })

  it('caps the scale so the long side does not blow past the max', () => {
    // short side 10 would want scale 24, but that would make the long side
    // (2000 * 24 = 48000) far exceed the cap, so the cap wins instead
    const scale = cropScaleFactor(10, 2000)
    expect(scale).toBeCloseTo(2600 / 2000, 5)
  })

  it('does not blow up on a degenerate zero-size input', () => {
    expect(cropScaleFactor(0, 100)).toBe(1)
  })

  it('leaves an already-large crop roughly alone rather than shrinking it a lot', () => {
    const scale = cropScaleFactor(300, 900)
    expect(scale).toBeGreaterThan(0.1)
  })
})
