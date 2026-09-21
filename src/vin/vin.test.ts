import { describe, expect, it } from 'vitest'
import { computeCheckDigit, hasValidFormat, isCheckDigitValid, modelYear, normalizeVin } from './vin.ts'

const HONDA = '1HGCM82633A004352' // check digit 3, model year 2003
const MCI_BUS = '1M8GDM9AXKP042788' // check digit X, model year 1989 (position 7 is numeric)
const PORSCHE = 'WP0ZZZ99ZTS392124' // European VIN, check digit intentionally not valid

describe('normalizeVin', () => {
  it('uppercases and strips whitespace and hyphens', () => {
    expect(normalizeVin(' 1hg-cm8263-3a004352 ')).toBe('1HGCM82633A004352')
  })

  it('leaves an already-clean VIN untouched', () => {
    expect(normalizeVin(HONDA)).toBe(HONDA)
  })

  it('strips internal tabs and newlines along with spaces', () => {
    expect(normalizeVin('1HGCM8\t2633A\n004352')).toBe(HONDA)
  })
})

describe('hasValidFormat', () => {
  it('accepts a well-formed 17-character VIN', () => {
    expect(hasValidFormat(HONDA)).toBe(true)
  })

  it('rejects wrong lengths', () => {
    expect(hasValidFormat(HONDA.slice(0, 16))).toBe(false)
    expect(hasValidFormat(HONDA + '1')).toBe(false)
    expect(hasValidFormat('')).toBe(false)
  })

  it('rejects I, O, and Q', () => {
    expect(hasValidFormat('1HGCM8263IA004352')).toBe(false)
    expect(hasValidFormat('1HGCM8263OA004352')).toBe(false)
    expect(hasValidFormat('1HGCM8263QA004352')).toBe(false)
  })

  it('rejects lowercase input (format check is case-sensitive)', () => {
    expect(hasValidFormat(HONDA.toLowerCase())).toBe(false)
  })
})

describe('computeCheckDigit', () => {
  it('computes the known check digit for the Honda example', () => {
    expect(computeCheckDigit(HONDA)).toBe('3')
  })

  it('computes X when the remainder is 10', () => {
    expect(computeCheckDigit(MCI_BUS)).toBe('X')
  })

  it('returns null for an invalid format', () => {
    expect(computeCheckDigit('too-short')).toBeNull()
  })
})

describe('isCheckDigitValid', () => {
  it('validates a correct VIN', () => {
    expect(isCheckDigitValid(HONDA)).toBe(true)
    expect(isCheckDigitValid(MCI_BUS)).toBe(true)
  })

  it('rejects a VIN whose stored check digit does not match', () => {
    expect(isCheckDigitValid(PORSCHE)).toBe(false)
  })

  it('rejects an invalid-format VIN outright', () => {
    expect(isCheckDigitValid('not a vin')).toBe(false)
  })

  it('detects a single corrupted character', () => {
    const corrupted = HONDA.slice(0, 16) + '9' // last digit 2 -> 9
    expect(isCheckDigitValid(corrupted)).toBe(false)
  })
})

describe('modelYear', () => {
  it('reads a digit year code from the earlier cycle', () => {
    expect(modelYear(HONDA)).toBe(2003) // position 7 is '2', a digit -> 1980-2009 cycle
  })

  it('reads a letter year code, disambiguated to the earlier cycle by a numeric position 7', () => {
    expect(modelYear(MCI_BUS)).toBe(1989) // position 7 is '9', a digit -> earlier cycle, K = 1989
  })

  it('reads the same letter code as the later cycle when position 7 is a letter', () => {
    const laterCycleVin = MCI_BUS.slice(0, 6) + 'A' + MCI_BUS.slice(7) // force position 7 to a letter
    expect(laterCycleVin[6]).toBe('A')
    expect(modelYear(laterCycleVin)).toBe(2019) // same K code, now the 2010-2039 cycle
  })

  it('returns null for illegal year codes', () => {
    const zero = HONDA.slice(0, 9) + '0' + HONDA.slice(10)
    const u = HONDA.slice(0, 9) + 'U' + HONDA.slice(10)
    const z = HONDA.slice(0, 9) + 'Z' + HONDA.slice(10)
    expect(modelYear(zero)).toBeNull()
    expect(modelYear(u)).toBeNull()
    expect(modelYear(z)).toBeNull()
  })

  it('returns null for an invalid-format VIN', () => {
    expect(modelYear('short')).toBeNull()
  })

  it('covers the full digit range 2001-2009 / 2031-2039', () => {
    const digitEarlier = HONDA.slice(0, 9) + '7' + HONDA.slice(10) // position 7 stays a digit
    expect(modelYear(digitEarlier)).toBe(2007)
    const digitLater = HONDA.slice(0, 6) + 'A' + HONDA.slice(7, 9) + '7' + HONDA.slice(10)
    expect(digitLater[6]).toBe('A')
    expect(modelYear(digitLater)).toBe(2037)
  })
})
