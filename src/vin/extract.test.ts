import { describe, expect, it } from 'vitest'
import { findVins } from './extract.ts'

const HONDA = '1HGCM82633A004352'
const PORSCHE = 'WP0ZZZ99ZTS392124' // European VIN: format valid, check digit not valid, no single-substitution suggestion

// European VINs skip the check digit, so each must come back unchanged rather than "corrected".
const EURO_VINS = [
  'WBA3A5C51CF256985',
  'VF1RFB00X56123456',
  'ZFA31200000123456',
  'SALLAAA146A123456',
  'WAUZZZ8V5KA123456',
]

describe('findVins', () => {
  it('returns an empty array when there is no VIN', () => {
    expect(findVins('no vin here just some text 12345')).toEqual([])
  })

  it('does not mint false positives out of ordinary prose', () => {
    const prose = [
      'The quick brown fox jumps over the lazy dog while the mechanic ordered replacement parts',
      'for the sedan last Tuesday afternoon near the garage downtown before closing time arrived',
    ].join(' ')
    expect(findVins(prose)).toEqual([])
  })

  it('does not report a check-digit-valid hit from an arbitrary slice of long garbage', () => {
    // "2C3D4E5F6G7H8J9K0" passes the check digit but is an interior slice with no VIN prefix.
    expect(findVins('S/N A1B2C3D4E5F6G7H8J9K0L1M2N3')).toEqual([])
  })

  it('finds a standalone VIN', () => {
    const result = findVins(HONDA)
    expect(result).toEqual([
      { vin: HONDA, raw: HONDA, checkDigitValid: true, corrected: false, suggestions: [] },
    ])
  })

  it('rejects an all-digit run', () => {
    expect(findVins('12345678901234567')).toEqual([])
  })

  it('rejects an all-letter run', () => {
    expect(findVins('ABCDEFGHJKLMNPRST')).toEqual([])
  })

  it('finds a VIN after "VIN:" with no separator before the check', () => {
    const result = findVins(`VIN:${HONDA}`)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ vin: HONDA, checkDigitValid: true, corrected: false })
  })

  it('finds a VIN after "VIN#"', () => {
    const result = findVins(`VIN#${HONDA}`)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ vin: HONDA, checkDigitValid: true, corrected: false })
  })

  it('finds a check-digit-valid VIN glued directly after a "VIN" prefix inside a longer run', () => {
    const result = findVins(`VIN${HONDA}X`)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ vin: HONDA, checkDigitValid: true, corrected: false })
  })

  it('maps I/O/Q OCR confusions and marks the result corrected', () => {
    const ocrText = '1HGCM82633AOO4352' // the two 0s misread as O
    const result = findVins(ocrText)
    expect(result).toEqual([
      { vin: HONDA, raw: ocrText, checkDigitValid: true, corrected: true, suggestions: [] },
    ])
  })

  it('never substitutes the VIN itself to force a check-digit match, only suggests', () => {
    const ocrText = '1HGCM82633A0043S2' // position 16 (0-indexed 15) '5' misread as 'S'
    const result = findVins(ocrText)
    expect(result).toEqual([
      {
        vin: ocrText, // unchanged: S is a legal VIN char, so it is not silently rewritten
        raw: ocrText,
        checkDigitValid: false,
        corrected: false,
        suggestions: [HONDA],
      },
    ])
  })

  it('ranks the true VIN first when a 1-for-T misread has multiple check-digit-valid substitutions', () => {
    const ocrText = 'THGCM82633A004352' // Tesseract misread the leading 1 as T
    const result = findVins(ocrText)
    expect(result).toHaveLength(1)
    expect(result[0].vin).toBe(ocrText)
    expect(result[0].suggestions[0]).toBe(HONDA)
    const otherIndex = result[0].suggestions.indexOf('THGCM82633AD04352')
    if (otherIndex !== -1) expect(otherIndex).toBeGreaterThan(0)
  })

  it('joins a VIN split across single spaces', () => {
    const ocrText = '1HGCM 82633A 004352'
    const result = findVins(ocrText)
    expect(result).toEqual([
      { vin: HONDA, raw: ocrText, checkDigitValid: true, corrected: false, suggestions: [] },
    ])
  })

  it('joins a VIN split across single hyphens', () => {
    const ocrText = '1HGCM-82633A-004352'
    const result = findVins(ocrText)
    expect(result).toEqual([
      { vin: HONDA, raw: ocrText, checkDigitValid: true, corrected: false, suggestions: [] },
    ])
  })

  it('does not join tokens across a newline', () => {
    expect(findVins('1HGCM 82633A\n004352')).toEqual([])
  })

  it('rejects a token join whose check digit fails, even though it is a whole-token match', () => {
    // Joined tokens must pass the check digit outright, or prose would mint false VINs.
    expect(findVins('1HGCM 82633A 004353')).toEqual([]) // last digit changed, check digit now wrong
  })

  it('keeps a check-digit-invalid European VIN unchanged when it is a standalone token', () => {
    const result = findVins(PORSCHE)
    expect(result).toHaveLength(1)
    expect(result[0].vin).toBe(PORSCHE) // must not be silently corrected to a different VIN
    expect(result[0].checkDigitValid).toBe(false)
    expect(result[0].corrected).toBe(false)
    expect(Array.isArray(result[0].suggestions)).toBe(true)
  })

  it.each(EURO_VINS)('keeps European VIN %s unchanged with checkDigitValid false', (euro) => {
    const result = findVins(euro)
    expect(result).toHaveLength(1)
    expect(result[0].vin).toBe(euro)
    expect(result[0].raw).toBe(euro)
    expect(result[0].checkDigitValid).toBe(false)
    expect(result[0].corrected).toBe(false)
    expect(Array.isArray(result[0].suggestions)).toBe(true)
  })

  it('drops a check-digit-invalid candidate that is only an arbitrary slice of a longer run', () => {
    // Glued junk breaks the whole-token match, and the check digit fails, so nothing is reported.
    expect(findVins(`XX${PORSCHE}YY`)).toEqual([])
  })

  it('finds multiple VINs in one text, ordered check-digit-valid first then by position', () => {
    const text = `Vehicle B: ${PORSCHE}. Vehicle A: ${HONDA}.`
    const result = findVins(text)
    expect(result).toEqual([
      { vin: HONDA, raw: HONDA, checkDigitValid: true, corrected: false, suggestions: [] },
      { vin: PORSCHE, raw: PORSCHE, checkDigitValid: false, corrected: false, suggestions: [] },
    ])
  })

  it('orders same-validity candidates by position in the text', () => {
    const other = '1M8GDM9AXKP042788'
    const text = `${other} ... ${HONDA}`
    const result = findVins(text)
    expect(result.map((c) => c.vin)).toEqual([other, HONDA])
  })

  it('dedupes repeated occurrences of the same VIN', () => {
    const text = `${HONDA} appears twice: ${HONDA}`
    expect(findVins(text)).toEqual([
      { vin: HONDA, raw: HONDA, checkDigitValid: true, corrected: false, suggestions: [] },
    ])
  })

  it('preserves original casing in raw while the vin field is uppercase', () => {
    const text = `vin: ${HONDA.toLowerCase()} in text`
    const result = findVins(text)
    expect(result).toEqual([
      { vin: HONDA, raw: HONDA.toLowerCase(), checkDigitValid: true, corrected: false, suggestions: [] },
    ])
  })

  it('returns [] for empty input', () => {
    expect(findVins('')).toEqual([])
  })
})
