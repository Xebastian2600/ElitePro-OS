import { describe, expect, it } from 'vitest'
import type { VinCandidate } from '../../vin/extract.ts'
import { MIN_CONFIDENCE, pickBestPass, type OrientationPass } from './scanPhoto.ts'

function candidate(vin: string, checkDigitValid: boolean): VinCandidate {
  return { vin, raw: vin, checkDigitValid, corrected: false, suggestions: [] }
}

describe('pickBestPass', () => {
  it('stops at the first confident, check-digit-valid pass rather than a later, higher-confidence one', () => {
    const passes: OrientationPass[] = [
      { degrees: 0, confidence: 90, candidates: [candidate('1HGCM82633A004352', true)] },
      { degrees: 90, confidence: 95, candidates: [candidate('WBA3A5C51CF256985', true)] },
    ]
    expect(pickBestPass(passes)).toBe(passes[0])
  })

  it('falls back to the highest-confidence pass when no pass is confident and valid', () => {
    const passes: OrientationPass[] = [
      { degrees: 0, confidence: 25, candidates: [] },
      { degrees: 90, confidence: 58, candidates: [candidate('5XXG64J22MG056094', false)] },
      { degrees: 180, confidence: 53, candidates: [] },
    ]
    expect(pickBestPass(passes)).toBe(passes[1])
  })

  it('never pools candidates across orientations — the winning pass is returned intact, others are dropped', () => {
    const wrongOrientationHit = candidate('AL3VS3101K3AH0L0N', true) // e.g. a garbage 270deg reading that happens to pass the check digit
    const correctHit = candidate('5XXG64J22MG056093', true)
    const passes: OrientationPass[] = [
      { degrees: 90, confidence: 58, candidates: [correctHit] },
      { degrees: 270, confidence: 28, candidates: [wrongOrientationHit] },
    ]
    const best = pickBestPass(passes)
    expect(best.candidates).toEqual([correctHit])
  })

  it('does not treat a check-digit-valid hit below MIN_CONFIDENCE as a confirmed match', () => {
    const belowFloor = candidate('AL3VS3101K3AH0L0N', true)
    const passes: OrientationPass[] = [
      { degrees: 0, confidence: 20, candidates: [] },
      { degrees: 270, confidence: MIN_CONFIDENCE - 1, candidates: [belowFloor] },
    ]
    // Neither pass is "good" (the valid hit is under the confidence floor), so the
    // result comes from the plain highest-confidence fallback, not the early-exit path.
    expect(pickBestPass(passes)).toBe(passes[1])
  })

  it('prefers a pass with a candidate over a higher-confidence pass with none', () => {
    // Reproduces a real crop-scan case: the hi-res retry pass scored higher but
    // found no 17-character run at all, while the original pass it was retrying
    // had found one (just not a checksum-valid one) — losing that candidate
    // entirely would be worse for the user than showing an unconfirmed one.
    const unconfirmed = candidate('5XXG64722MG056093', false)
    const passes: OrientationPass[] = [
      { degrees: 90, confidence: 54, candidates: [unconfirmed] },
      { degrees: 90, confidence: 60, candidates: [] }, // the retry pass
    ]
    expect(pickBestPass(passes)).toBe(passes[0])
  })

  it('never surfaces a lucky check-digit-valid run from an unreadable orientation', () => {
    // The real 270deg false positive on kia-label-sideways.jpg, read at ~28 confidence.
    const passes: OrientationPass[] = [
      { degrees: 0, confidence: 25, candidates: [] },
      { degrees: 90, confidence: 45, candidates: [] },
      { degrees: 270, confidence: 28, candidates: [candidate('AL3VS3101K3AH0L0N', true)] },
    ]
    expect(pickBestPass(passes)).toBe(passes[1])
  })

  it('still falls back to the highest-confidence pass when nothing found any candidate', () => {
    const passes: OrientationPass[] = [
      { degrees: 0, confidence: 15, candidates: [] },
      { degrees: 90, confidence: 30, candidates: [] },
    ]
    expect(pickBestPass(passes)).toBe(passes[1])
  })

  it('matches the observed kia-label-sideways.jpg reading: 0deg is unreadable, 90deg finds the VIN', () => {
    const passes: OrientationPass[] = [
      { degrees: 0, confidence: 25, candidates: [] },
      { degrees: 90, confidence: 58, candidates: [candidate('5XXG64J22MG056093', true)] },
    ]
    const best = pickBestPass(passes)
    expect(best.degrees).toBe(90)
    expect(best.candidates).toEqual([candidate('5XXG64J22MG056093', true)])
  })
})
