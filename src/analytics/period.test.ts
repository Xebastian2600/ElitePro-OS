import { describe, expect, it } from 'vitest'
import { conversionRate, periodRange } from './period.ts'

describe('periodRange', () => {
  it('today: [start of local day, end of local day)', () => {
    const now = new Date(2026, 8, 21, 15, 30, 0) // Sep 21 2026, local
    const range = periodRange('today', now)
    expect(range.period).toBe('today')
    expect(range.start).toBe(new Date(2026, 8, 21, 0, 0, 0, 0).toISOString())
    expect(range.end).toBe(new Date(2026, 8, 22, 0, 0, 0, 0).toISOString())
  })

  it('7d: start of local day 6 days before now, end of today', () => {
    const now = new Date(2026, 8, 21, 15, 30, 0)
    const range = periodRange('7d', now)
    expect(range.start).toBe(new Date(2026, 8, 15, 0, 0, 0, 0).toISOString())
    expect(range.end).toBe(new Date(2026, 8, 22, 0, 0, 0, 0).toISOString())
  })

  it('30d: start of local day 29 days before now, end of today', () => {
    const now = new Date(2026, 8, 21, 15, 30, 0)
    const range = periodRange('30d', now)
    expect(range.start).toBe(new Date(2026, 7, 23, 0, 0, 0, 0).toISOString())
    expect(range.end).toBe(new Date(2026, 8, 22, 0, 0, 0, 0).toISOString())
  })

  it('7d window spans exactly 7 local calendar days (including today)', () => {
    const now = new Date(2026, 8, 21, 0, 0, 0)
    const range = periodRange('7d', now)
    const days = (new Date(range.end).getTime() - new Date(range.start).getTime()) / 86400000
    expect(days).toBe(7)
  })

  it('is DST-safe: local-component construction, not fixed millisecond arithmetic', () => {
    // Just after a US DST "spring forward" boundary (2am -> 3am on Mar 8 2026);
    // a naive now-6*86400000 computation would land on the wrong local day.
    const now = new Date(2026, 2, 9, 10, 0, 0) // Mar 9 2026, local
    const range = periodRange('7d', now)
    expect(range.start).toBe(new Date(2026, 2, 3, 0, 0, 0, 0).toISOString())
    expect(range.end).toBe(new Date(2026, 2, 10, 0, 0, 0, 0).toISOString())
  })
})

describe('conversionRate', () => {
  it('divides booked by total', () => {
    expect(conversionRate(3, 10)).toBeCloseTo(0.3)
    expect(conversionRate(0, 10)).toBe(0)
    expect(conversionRate(10, 10)).toBe(1)
  })

  it('is null when total is 0', () => {
    expect(conversionRate(0, 0)).toBeNull()
  })
})
