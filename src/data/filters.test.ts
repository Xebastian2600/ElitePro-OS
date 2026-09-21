import { describe, expect, it } from 'vitest'
import { sanitizeSearchTerm, sanitizeSearchWords } from './filters.ts'

describe('sanitizeSearchTerm', () => {
  it('strips PostgREST-reserved characters', () => {
    expect(sanitizeSearchTerm('Honda, Civic')).toBe('Honda Civic')
    expect(sanitizeSearchTerm('a(b)c')).toBe('abc')
    expect(sanitizeSearchTerm('quote"d')).toBe('quoted')
    expect(sanitizeSearchTerm('back\\slash')).toBe('backslash')
    expect(sanitizeSearchTerm('col:val')).toBe('colval')
    expect(sanitizeSearchTerm('wild*card%')).toBe('wildcard')
  })

  it('trims surrounding whitespace', () => {
    expect(sanitizeSearchTerm('  Honda  ')).toBe('Honda')
  })

  it('leaves an already-safe term unchanged', () => {
    expect(sanitizeSearchTerm('Honda Civic')).toBe('Honda Civic')
  })
})

describe('sanitizeSearchWords', () => {
  it('splits on whitespace and sanitizes each word', () => {
    expect(sanitizeSearchWords('Honda, Civic')).toEqual(['Honda', 'Civic'])
  })

  it('drops words that sanitize to nothing', () => {
    expect(sanitizeSearchWords('Honda ,, Civic')).toEqual(['Honda', 'Civic'])
  })

  it('returns a single-element array for a single word', () => {
    expect(sanitizeSearchWords('Honda')).toEqual(['Honda'])
  })

  it('returns an empty array for whitespace/reserved-only input', () => {
    expect(sanitizeSearchWords('   ')).toEqual([])
    expect(sanitizeSearchWords(',,()')).toEqual([])
  })
})
