import { describe, expect, it } from 'vitest'
import { rotatedSize } from './ocr.ts'

describe('rotatedSize', () => {
  it('keeps dimensions for 0 degrees', () => {
    expect(rotatedSize(1200, 800, 0)).toEqual({ width: 1200, height: 800 })
  })

  it('keeps dimensions for 180 degrees', () => {
    expect(rotatedSize(1200, 800, 180)).toEqual({ width: 1200, height: 800 })
  })

  it('swaps dimensions for 90 degrees', () => {
    expect(rotatedSize(1200, 800, 90)).toEqual({ width: 800, height: 1200 })
  })

  it('swaps dimensions for 270 degrees', () => {
    expect(rotatedSize(1200, 800, 270)).toEqual({ width: 800, height: 1200 })
  })
})
