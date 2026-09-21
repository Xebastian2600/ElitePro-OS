// Pure metric-period helpers — no Supabase import.

import { endOfLocalDay, startOfLocalDay } from '../followup/due.ts'
import type { MetricPeriod, PeriodRange } from '../followup/types.ts'

// Days before `now`'s local day that each period's window starts on
// (0 = today only).
const PERIOD_DAYS_BACK: Record<MetricPeriod, number> = {
  today: 0,
  '7d': 6,
  '30d': 29,
}

// [start, end) in local time, expressed as ISO strings. `end` is always the
// local midnight after `now`'s day (exclusive), so "today" includes
// everything up to the current instant and beyond within today.
export function periodRange(period: MetricPeriod, now: Date): PeriodRange {
  const daysBack = PERIOD_DAYS_BACK[period]
  const firstDay = new Date(now)
  firstDay.setDate(firstDay.getDate() - daysBack)

  return {
    period,
    start: startOfLocalDay(firstDay).toISOString(),
    end: endOfLocalDay(now).toISOString(),
  }
}

export function conversionRate(booked: number, total: number): number | null {
  if (total <= 0) return null
  return booked / total
}
