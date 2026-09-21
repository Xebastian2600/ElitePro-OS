// Command Center metrics + "today board" lists — every number comes from a real query,
// nothing mocked or seeded. See CommandCenterMetrics (src/followup/types.ts) for what each number means.

import { supabase } from '../lib/supabase.ts'
import { periodRange, conversionRate } from '../analytics/period.ts'
import { endOfLocalDay } from '../followup/due.ts'
import type { CommandCenterMetrics, FollowUpWithSource, MetricPeriod } from '../followup/types.ts'
import type { EntityType, JobWithRefs, LeadWithRefs } from '../shared/types.ts'
import { OPEN_LEAD_STATUSES } from '../shared/types.ts'
import { listQuotes, type QuoteWithRefs } from './quotes.ts'
import { listFollowUps } from './followUps.ts'
import { toDataError } from './errors.ts'
import { unwrap } from './unwrap.ts'

interface CountResult {
  count: number | null
  error: { code?: string; message?: string; details?: string | null; hint?: string | null } | null
}

function unwrapCount(result: CountResult): number {
  if (result.error) throw toDataError(result.error)
  return result.count ?? 0
}

async function countLeadsCreated(start: string, end: string): Promise<number> {
  return unwrapCount(
    await supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', start).lt('created_at', end),
  )
}

async function countQuotesCreated(start: string, end: string): Promise<number> {
  return unwrapCount(
    await supabase.from('quotes').select('id', { count: 'exact', head: true }).gte('created_at', start).lt('created_at', end),
  )
}

async function countQuotesOpen(): Promise<number> {
  return unwrapCount(
    await supabase
      .from('quotes')
      .select('id', { count: 'exact', head: true })
      .in('status', ['draft', 'presented', 'follow_up']),
  )
}

async function countJobsCreated(start: string, end: string): Promise<number> {
  return unwrapCount(
    await supabase.from('jobs').select('id', { count: 'exact', head: true }).gte('created_at', start).lt('created_at', end),
  )
}

async function countJobsScheduled(start: string, end: string): Promise<number> {
  return unwrapCount(
    await supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .gte('appointment_at', start)
      .lt('appointment_at', end)
      .not('status', 'in', '(completed,lost)'),
  )
}

async function countLeadsOpen(): Promise<number> {
  return unwrapCount(
    await supabase.from('leads').select('id', { count: 'exact', head: true }).in('status', OPEN_LEAD_STATUSES),
  )
}

async function countLeadsBookedCreatedInRange(start: string, end: string): Promise<number> {
  return unwrapCount(
    await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', start)
      .lt('created_at', end)
      .eq('status', 'booked'),
  )
}

async function countFollowUpsOverdue(now: string): Promise<number> {
  return unwrapCount(
    await supabase.from('follow_ups').select('id', { count: 'exact', head: true }).eq('status', 'open').lt('due_at', now),
  )
}

async function countFollowUpsDueToday(now: string, endOfToday: string): Promise<number> {
  return unwrapCount(
    await supabase
      .from('follow_ups')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .gte('due_at', now)
      .lt('due_at', endOfToday),
  )
}

async function countFollowUpsOpen(): Promise<number> {
  return unwrapCount(await supabase.from('follow_ups').select('id', { count: 'exact', head: true }).eq('status', 'open'))
}

// Distinct entity_id count for a `<entityType>.status_changed -> toValue`
// activity within [start, end). Counted in SQL (count_status_changes) so the
// number isn't capped by PostgREST's max-rows limit.
async function distinctEntityCount(entityType: EntityType, toValue: string, start: string, end: string): Promise<number> {
  const count = unwrap(
    await supabase.rpc('count_status_changes', { p_entity_type: entityType, p_to: toValue, p_start: start, p_end: end }),
  )
  return Number(count)
}

export async function getCommandCenterMetrics(period: MetricPeriod, now: Date = new Date()): Promise<CommandCenterMetrics> {
  const range = periodRange(period, now)
  const nowIso = now.toISOString()
  const endOfTodayIso = endOfLocalDay(now).toISOString()

  const [
    leads_created,
    quotes_created,
    quotes_open,
    leads_booked,
    jobs_created,
    jobs_scheduled,
    jobs_completed,
    leads_open,
    leads_lost,
    follow_ups_overdue,
    follow_ups_due_today,
    follow_ups_open,
    leadsBookedCreatedInRange,
  ] = await Promise.all([
    countLeadsCreated(range.start, range.end),
    countQuotesCreated(range.start, range.end),
    countQuotesOpen(),
    distinctEntityCount('lead', 'booked', range.start, range.end),
    countJobsCreated(range.start, range.end),
    countJobsScheduled(range.start, range.end),
    distinctEntityCount('job', 'completed', range.start, range.end),
    countLeadsOpen(),
    distinctEntityCount('lead', 'lost', range.start, range.end),
    countFollowUpsOverdue(nowIso),
    countFollowUpsDueToday(nowIso, endOfTodayIso),
    countFollowUpsOpen(),
    countLeadsBookedCreatedInRange(range.start, range.end),
  ])

  return {
    range,
    leads_created,
    quotes_created,
    quotes_open,
    leads_booked,
    jobs_created,
    jobs_scheduled,
    jobs_completed,
    leads_open,
    leads_lost,
    follow_ups_overdue,
    follow_ups_due_today,
    follow_ups_open,
    conversion_rate: conversionRate(leadsBookedCreatedInRange, leads_created),
  }
}

// Local duplicates of the join-select strings in src/data/leads.ts and src/data/jobs.ts
// (not exported there); kept in sync with LeadWithRefs / JobWithRefs.
const LEAD_WITH_REFS_SELECT = '*, customer:customers(id,name,phone,email), vehicle:vehicles(id,year,make,model,vin)'
const JOB_WITH_REFS_SELECT = '*, customer:customers(id,name,phone,email), vehicle:vehicles(id,year,make,model,vin)'

export interface TodayBoard {
  leadsToday: LeadWithRefs[]
  quotesOpen: QuoteWithRefs[]
  jobsToday: JobWithRefs[]
  followUpsDue: FollowUpWithSource[]
}

// "Today" lists: leads created today, quotes still open, jobs appointed today,
// and follow-ups overdue or due today.
export async function listTodayBoard(now: Date = new Date()): Promise<TodayBoard> {
  const { start: startToday, end: endToday } = periodRange('today', now)

  const [leadsResult, quoteLists, jobsResult, followUpsDue] = await Promise.all([
    supabase
      .from('leads')
      .select(LEAD_WITH_REFS_SELECT)
      .gte('created_at', startToday)
      .lt('created_at', endToday)
      .order('created_at', { ascending: false })
      .limit(20),
    // listQuotes only filters on a single status, so fetch the three open
    // statuses separately and merge rather than editing src/data/quotes.ts.
    Promise.all([listQuotes({ status: 'draft' }), listQuotes({ status: 'presented' }), listQuotes({ status: 'follow_up' })]),
    supabase
      .from('jobs')
      .select(JOB_WITH_REFS_SELECT)
      .gte('appointment_at', startToday)
      .lt('appointment_at', endToday)
      .order('appointment_at', { ascending: true })
      .limit(50),
    // "overdue + due today" open follow-ups = open, due_at < end of today.
    listFollowUps({ status: 'open', dueBefore: endToday, limit: 50 }),
  ])

  const leadsToday = unwrap(leadsResult) as unknown as LeadWithRefs[]
  const jobsToday = unwrap(jobsResult) as unknown as JobWithRefs[]
  const quotesOpen = quoteLists
    .flat()
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 20)

  return { leadsToday, quotesOpen, jobsToday, followUpsDue }
}
