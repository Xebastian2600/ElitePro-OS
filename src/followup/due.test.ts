import { describe, expect, it } from 'vitest'
import { dueState, endOfLocalDay, snoozeUntil, sortQueue, startOfLocalDay } from './due.ts'

describe('startOfLocalDay / endOfLocalDay', () => {
  it('returns local midnight and the exclusive next local midnight', () => {
    const now = new Date(2026, 8, 21, 14, 30, 0) // Sep 21 2026, 2:30pm local
    expect(startOfLocalDay(now).getTime()).toBe(new Date(2026, 8, 21, 0, 0, 0, 0).getTime())
    expect(endOfLocalDay(now).getTime()).toBe(new Date(2026, 8, 22, 0, 0, 0, 0).getTime())
  })

  it('does not mutate the input date', () => {
    const now = new Date(2026, 8, 21, 14, 30, 0)
    const copy = new Date(now)
    startOfLocalDay(now)
    endOfLocalDay(now)
    expect(now.getTime()).toBe(copy.getTime())
  })

  it('rolls over correctly across a month boundary', () => {
    const now = new Date(2026, 8, 30, 23, 59, 0) // Sep 30
    expect(endOfLocalDay(now).getTime()).toBe(new Date(2026, 9, 1, 0, 0, 0, 0).getTime())
  })
})

describe('dueState boundaries', () => {
  const now = new Date(2026, 8, 21, 12, 0, 0) // Sep 21 2026, noon local

  it('is overdue when due_at is before now', () => {
    expect(dueState(new Date(2026, 8, 21, 11, 59, 59).toISOString(), now)).toBe('overdue')
    expect(dueState(new Date(2026, 8, 20, 23, 59, 0).toISOString(), now)).toBe('overdue')
  })

  it('is due_today right at now, and up to (but not including) local midnight', () => {
    expect(dueState(now.toISOString(), now)).toBe('due_today')
    expect(dueState(new Date(2026, 8, 21, 23, 59, 59).toISOString(), now)).toBe('due_today')
  })

  it('is upcoming exactly at the next local midnight and beyond', () => {
    expect(dueState(new Date(2026, 8, 22, 0, 0, 0).toISOString(), now)).toBe('upcoming')
    expect(dueState(new Date(2026, 8, 25, 0, 0, 0).toISOString(), now)).toBe('upcoming')
  })
})

describe('snoozeUntil', () => {
  const now = new Date(2026, 8, 21, 14, 30, 0)

  it('1h adds one hour', () => {
    const result = snoozeUntil('1h', now)
    expect(result.getTime()).toBe(new Date(2026, 8, 21, 15, 30, 0).getTime())
  })

  it('3d adds three days, same time of day', () => {
    const result = snoozeUntil('3d', now)
    expect(result.getTime()).toBe(new Date(2026, 8, 24, 14, 30, 0).getTime())
  })

  it('tomorrow_9am moves to 9am the next local day', () => {
    const result = snoozeUntil('tomorrow_9am', now)
    expect(result.getTime()).toBe(new Date(2026, 8, 22, 9, 0, 0, 0).getTime())
  })

  it('tomorrow_9am after 9am today still lands on tomorrow (never today)', () => {
    const lateNow = new Date(2026, 8, 21, 8, 0, 0)
    const result = snoozeUntil('tomorrow_9am', lateNow)
    expect(result.getTime()).toBe(new Date(2026, 8, 22, 9, 0, 0, 0).getTime())
  })
})

describe('sortQueue', () => {
  const now = new Date(2026, 8, 21, 12, 0, 0)

  it('orders overdue (oldest first), then due today, then upcoming (soonest first)', () => {
    const items = [
      { id: 'upcoming-late', due_at: new Date(2026, 8, 30, 0, 0, 0).toISOString() },
      { id: 'overdue-recent', due_at: new Date(2026, 8, 21, 10, 0, 0).toISOString() },
      { id: 'due-today-late', due_at: new Date(2026, 8, 21, 23, 0, 0).toISOString() },
      { id: 'overdue-oldest', due_at: new Date(2026, 8, 15, 0, 0, 0).toISOString() },
      { id: 'upcoming-soon', due_at: new Date(2026, 8, 22, 1, 0, 0).toISOString() },
      { id: 'due-today-soon', due_at: new Date(2026, 8, 21, 12, 5, 0).toISOString() },
    ]

    const sorted = sortQueue(items, now).map((i) => i.id)
    expect(sorted).toEqual([
      'overdue-oldest',
      'overdue-recent',
      'due-today-soon',
      'due-today-late',
      'upcoming-soon',
      'upcoming-late',
    ])
  })

  it('does not mutate the input array', () => {
    const items = [
      { id: 'a', due_at: new Date(2026, 8, 25, 0, 0, 0).toISOString() },
      { id: 'b', due_at: new Date(2026, 8, 15, 0, 0, 0).toISOString() },
    ]
    const copy = [...items]
    sortQueue(items, now)
    expect(items).toEqual(copy)
  })
})
