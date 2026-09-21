// Workstream C shared contract: FollowUp + Command Center metric shapes.
// Keep in sync with supabase/migrations/20260921180000_command_center.sql.

import type { StatusOption } from '../shared/types.ts'

// ------------------------------------------------------------------
// Follow-ups
// ------------------------------------------------------------------

// open: in the queue. done: an outcome was recorded. cancelled: dropped
// without an outcome. Snoozing keeps a follow-up open with a later due_at.
export type FollowUpStatus = 'open' | 'done' | 'cancelled'

export const FOLLOW_UP_STATUSES: StatusOption<FollowUpStatus>[] = [
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
]

// One-click outcomes from the queue. Each one may also update the source
// record (see FOLLOW_UP_OUTCOME_EFFECTS); 'snoozed' only moves due_at.
export type FollowUpOutcome = 'contacted' | 'booked' | 'lost' | 'snoozed'

export const FOLLOW_UP_OUTCOMES: StatusOption<FollowUpOutcome>[] = [
  { value: 'contacted', label: 'Contacted' },
  { value: 'booked', label: 'Booked' },
  { value: 'lost', label: 'Lost' },
  { value: 'snoozed', label: 'Snoozed' },
]

export type FollowUpSourceType = 'lead' | 'quote' | 'job'

// What each outcome does to the source record. null = source untouched.
// Applied through Workstream A/B data functions (updateLeadStatus,
// updateQuoteStatus, updateJobStatus) so their validation still runs.
//   lead:  contacted -> 'contacted' (only when lead is 'new'); booked -> 'booked'; lost -> 'lost' (reason required)
//   quote: contacted -> 'follow_up' (only when quote is 'presented'); booked -> 'approved'; lost -> 'lost' (reason required)
//   job:   contacted -> none; booked -> 'booked'; lost -> 'lost'
export const FOLLOW_UP_OUTCOME_EFFECTS: Record<FollowUpSourceType, Record<Exclude<FollowUpOutcome, 'snoozed'>, string | null>> = {
  lead: { contacted: 'contacted', booked: 'booked', lost: 'lost' },
  quote: { contacted: 'follow_up', booked: 'approved', lost: 'lost' },
  job: { contacted: null, booked: 'booked', lost: 'lost' },
}

export interface FollowUp {
  id: string
  // Exactly one of lead_id / quote_id / job_id is set (DB check constraint).
  lead_id: string | null
  quote_id: string | null
  job_id: string | null
  due_at: string
  action: string
  status: FollowUpStatus
  owner_id: string | null
  notes: string | null
  // Additive beyond the shared contract:
  outcome: FollowUpOutcome | null
  completed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface FollowUpInput {
  lead_id?: string | null
  quote_id?: string | null
  job_id?: string | null
  due_at: string
  action: string
  owner_id?: string | null
  notes?: string | null
}

// Joined shape for the queue: enough to render a row and link to the source.
export interface FollowUpWithSource extends FollowUp {
  source: {
    type: FollowUpSourceType
    id: string
    status: string
    customer_name: string | null
    href: string // e.g. /leads/<id>
  }
}

// Queue bucket, computed client-side from due_at and "now".
export type DueState = 'overdue' | 'due_today' | 'upcoming'

// ------------------------------------------------------------------
// Command Center metrics (all derived from real rows — never mocked)
// ------------------------------------------------------------------

export type MetricPeriod = 'today' | '7d' | '30d'

export interface PeriodRange {
  period: MetricPeriod
  start: string // ISO, inclusive (local midnight of the first day)
  end: string // ISO, exclusive (local midnight after "now"'s day)
}

export interface CommandCenterMetrics {
  range: PeriodRange
  leads_created: number // leads.created_at in range
  quotes_created: number // quotes.created_at in range
  quotes_open: number // quotes in draft/presented/follow_up (point in time)
  leads_booked: number // distinct leads with a lead.status_changed -> booked activity in range
  jobs_created: number // jobs.created_at in range
  jobs_scheduled: number // jobs with appointment_at in range, status not completed/lost
  jobs_completed: number // distinct jobs with job.status_changed -> completed activity in range
  leads_open: number // leads not booked/lost (point in time)
  leads_lost: number // distinct leads with lead.status_changed -> lost activity in range
  follow_ups_overdue: number // open, due_at < now
  follow_ups_due_today: number // open, now <= due_at < end of today
  follow_ups_open: number // all open
  // leads created in range that are now 'booked' / leads created in range; null when 0 leads.
  conversion_rate: number | null
}
