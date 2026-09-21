// Pure due-date helpers for the follow-up queue — no Supabase import.
// "Today" always means the LOCAL calendar day of the supplied `now`.

import type { DueState } from './types.ts'

// Local midnight of `d`'s calendar day.
export function startOfLocalDay(d: Date): Date {
  const start = new Date(d)
  start.setHours(0, 0, 0, 0)
  return start
}

// Local midnight of the day AFTER `d` (exclusive upper bound). Uses
// setDate(+1) + setHours(0,0,0,0) rather than +86400000ms so a DST
// transition day (23h or 25h long) still lands on the correct local
// midnight.
export function endOfLocalDay(d: Date): Date {
  const end = new Date(d)
  end.setDate(end.getDate() + 1)
  end.setHours(0, 0, 0, 0)
  return end
}

export function dueState(due_at: string, now: Date): DueState {
  const dueMs = new Date(due_at).getTime()
  if (dueMs < now.getTime()) return 'overdue'
  if (dueMs < endOfLocalDay(now).getTime()) return 'due_today'
  return 'upcoming'
}

// '9am' in 'tomorrow_9am' is a UI convenience default, not company policy —
// fine to hard-code here.
export type SnoozeOption = '1h' | 'tomorrow_9am' | '3d'

export function snoozeUntil(option: SnoozeOption, now: Date): Date {
  const next = new Date(now)
  if (option === '1h') {
    next.setHours(next.getHours() + 1)
    return next
  }
  if (option === '3d') {
    next.setDate(next.getDate() + 3)
    return next
  }
  // tomorrow_9am
  next.setDate(next.getDate() + 1)
  next.setHours(9, 0, 0, 0)
  return next
}

const BUCKET_RANK: Record<DueState, number> = { overdue: 0, due_today: 1, upcoming: 2 }

// Overdue first (oldest due_at first), then due today, then upcoming
// (soonest due_at first). Within every bucket this is just ascending
// due_at, since "oldest overdue" and "soonest upcoming" are both the
// smallest due_at.
export function sortQueue<T extends { due_at: string }>(items: T[], now: Date): T[] {
  return [...items].sort((a, b) => {
    const rankDiff = BUCKET_RANK[dueState(a.due_at, now)] - BUCKET_RANK[dueState(b.due_at, now)]
    if (rankDiff !== 0) return rankDiff
    return new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
  })
}
