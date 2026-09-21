// Ported from the Auto VIN detector project.

const VALID_VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/

// ISO 3779 / 49 CFR 565 letter-to-digit transliteration for the check digit sum.
const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5,
  P: 7,
  R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
}

// Position weights 1-17; position 9 (the check digit itself) carries weight 0.
const CHECK_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]

// Year codes 1980-2000, reused +30 for 2010-2030; index doubles as the offset into each cycle.
const YEAR_LETTERS = 'ABCDEFGHJKLMNPRSTVWXY'

export function normalizeVin(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, '')
}

export function hasValidFormat(vin: string): boolean {
  return VALID_VIN_RE.test(vin)
}

export function computeCheckDigit(vin: string): string | null {
  if (!hasValidFormat(vin)) return null
  let sum = 0
  for (let i = 0; i < 17; i++) {
    const ch = vin[i]
    const value = ch >= '0' && ch <= '9' ? Number(ch) : TRANSLITERATION[ch]
    sum += value * CHECK_WEIGHTS[i]
  }
  const remainder = sum % 11
  return remainder === 10 ? 'X' : String(remainder)
}

export function isCheckDigitValid(vin: string): boolean {
  if (!hasValidFormat(vin)) return false
  return computeCheckDigit(vin) === vin[8]
}

export function modelYear(vin: string): number | null {
  if (!hasValidFormat(vin)) return null
  const code = vin[9]
  // Position 7 disambiguates the 30-year cycle (49 CFR 565 NA rule): letter means 2010+, digit means 1980-2009.
  const laterCycle = /[A-Z]/.test(vin[6])

  if (code >= '0' && code <= '9') {
    if (code === '0') return null
    const digit = Number(code)
    return (laterCycle ? 2030 : 2000) + digit
  }

  const idx = YEAR_LETTERS.indexOf(code)
  if (idx === -1) return null // U, Z are legal VIN letters but not valid year codes
  return (laterCycle ? 2010 : 1980) + idx
}
