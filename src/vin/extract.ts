import { hasValidFormat, isCheckDigitValid } from './vin.ts'

export interface VinCandidate {
  vin: string
  raw: string
  checkDigitValid: boolean
  corrected: boolean       // true only when an I/O/Q OCR misread was mapped
  suggestions: string[]    // check-digit-valid alternates from a single substitution, ranked; usually []
}

// Classic OCR misreads that are never legal VIN characters, always corrected.
const ILLEGAL_OCR_MAP: Record<string, string> = { I: '1', O: '0', Q: '0' }

// Visually confusable characters; one substitution is tried at a time.
const CONFUSION_NEIGHBORS: Record<string, string[]> = {
  '1': ['L', 'T', '7'],
  L: ['1'],
  T: ['1', '7'],
  '7': ['1', 'T'],
  '0': ['D'],
  D: ['0'],
  '8': ['B'],
  B: ['8'],
  '5': ['S'],
  S: ['5'],
  '2': ['Z'],
  Z: ['2'],
  '6': ['G'],
  G: ['6'],
  '4': ['A'],
  A: ['4'],
}

// The serial section (positions 12-17) is numeric for high-volume makers.
const SERIAL_SECTION_START = 11

const ALL_DIGITS_RE = /^[0-9]{17}$/
const ALL_LETTERS_RE = /^[A-Z]{17}$/
const MAX_JOINED_TOKENS = 8

interface Word {
  text: string
  start: number
  end: number
}

interface RawWindow {
  upper: string
  raw: string
  start: number
  // Only an exact 17-char run may be kept with a failing check digit, and only it gets suggestions.
  isStandalone: boolean
}

function findWords(upperLine: string): Word[] {
  const words: Word[] = []
  const re = /[A-Z0-9]+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(upperLine)) !== null) {
    words.push({ text: m[0], start: m.index, end: m.index + m[0].length })
  }
  return words
}

function makeWindow(line: string, upperLine: string, start: number, isStandalone: boolean): RawWindow {
  return {
    upper: upperLine.slice(start, start + 17),
    raw: line.slice(start, start + 17),
    start,
    isStandalone,
  }
}

// Interior slices of long runs are too likely to hit the check digit by chance, so only the run's
// edges and the spot right after a "VIN" prefix are tried.
function boundaryOffsets(word: string): number[] {
  const maxOffset = word.length - 17
  const offsets = new Set<number>([0, maxOffset])
  for (let idx = 0; idx + 3 <= word.length; idx++) {
    if (word.slice(idx, idx + 3) === 'VIN') {
      const off = idx + 3
      if (off <= maxOffset) offsets.add(off)
    }
  }
  return Array.from(offsets)
}

function windowsFromLine(line: string, upperLine: string): RawWindow[] {
  const words = findWords(upperLine)
  const windows: RawWindow[] = []

  for (const word of words) {
    if (word.text.length < 17) continue
    if (word.text.length === 17) {
      windows.push(makeWindow(line, upperLine, word.start, true))
      continue
    }
    for (const offset of boundaryOffsets(word.text)) {
      windows.push(makeWindow(line, upperLine, word.start + offset, false))
    }
  }

  for (let i = 0; i < words.length; i++) {
    if (words[i].text.length >= 17) continue // already covered as a run above
    let cumulative = words[i].text
    let cumEnd = words[i].end
    let joinedCount = 1
    let j = i + 1
    while (cumulative.length < 17 && j < words.length && joinedCount < MAX_JOINED_TOKENS) {
      const separator = upperLine.slice(cumEnd, words[j].start)
      if (separator.length !== 1 || (separator !== ' ' && separator !== '-')) break
      cumulative += words[j].text
      cumEnd = words[j].end
      joinedCount++
      j++
    }
    if (cumulative.length === 17) {
      windows.push({
        upper: cumulative,
        raw: line.slice(words[i].start, cumEnd),
        start: words[i].start,
        isStandalone: false,
      })
    }
  }

  return windows
}

function applyIllegalOcrMap(upper: string): { mapped: string; corrected: boolean } {
  let corrected = false
  let mapped = ''
  for (const ch of upper) {
    const replacement = ILLEGAL_OCR_MAP[ch]
    if (replacement !== undefined) {
      corrected = true
      mapped += replacement
    } else {
      mapped += ch
    }
  }
  return { mapped, corrected }
}

function isUniform(s: string): boolean {
  return ALL_DIGITS_RE.test(s) || ALL_LETTERS_RE.test(s)
}

function serialSectionLetterPenalty(source: string, candidate: string): number {
  let penalty = 0
  for (let i = SERIAL_SECTION_START; i < 17; i++) {
    if (source[i] >= '0' && source[i] <= '9' && candidate[i] >= 'A' && candidate[i] <= 'Z') penalty++
  }
  return penalty
}

// Never mutates the VIN; returns check-digit-valid alternates, most plausible first.
function confusionSuggestions(vin: string): string[] {
  const scored: { candidate: string; position: number; penalty: number }[] = []
  const seen = new Set<string>()
  for (let pos = 0; pos < 17; pos++) {
    for (const alt of CONFUSION_NEIGHBORS[vin[pos]] ?? []) {
      const candidate = vin.slice(0, pos) + alt + vin.slice(pos + 1)
      if (isUniform(candidate) || seen.has(candidate)) continue
      if (isCheckDigitValid(candidate)) {
        seen.add(candidate)
        scored.push({ candidate, position: pos, penalty: serialSectionLetterPenalty(vin, candidate) })
      }
    }
  }
  return scored
    .sort((a, b) => a.penalty - b.penalty || a.position - b.position)
    .map((s) => s.candidate)
}

interface Scored {
  vin: string
  raw: string
  checkDigitValid: boolean
  corrected: boolean
  suggestions: string[]
  position: number
}

export function findVins(text: string): VinCandidate[] {
  const lines = text.split('\n')
  const scored: Scored[] = []
  let lineOffset = 0

  for (const line of lines) {
    const upperLine = line.toUpperCase()
    for (const win of windowsFromLine(line, upperLine)) {
      const { mapped, corrected } = applyIllegalOcrMap(win.upper)
      if (isUniform(mapped)) continue
      if (!hasValidFormat(mapped)) continue

      const checkDigitValid = isCheckDigitValid(mapped)
      if (!checkDigitValid && !win.isStandalone) continue

      scored.push({
        vin: mapped,
        raw: win.raw,
        checkDigitValid,
        corrected,
        suggestions: checkDigitValid ? [] : confusionSuggestions(mapped),
        position: lineOffset + win.start,
      })
    }
    lineOffset += line.length + 1 // account for the removed newline
  }

  const byVin = new Map<string, Scored>()
  for (const candidate of scored) {
    const existing = byVin.get(candidate.vin)
    if (!existing || (!existing.checkDigitValid && candidate.checkDigitValid)) {
      byVin.set(candidate.vin, candidate)
    }
  }

  return Array.from(byVin.values())
    .sort((a, b) => {
      if (a.checkDigitValid !== b.checkDigitValid) return a.checkDigitValid ? -1 : 1
      return a.position - b.position
    })
    .map(({ vin, raw, checkDigitValid, corrected, suggestions }) => ({ vin, raw, checkDigitValid, corrected, suggestions }))
}
