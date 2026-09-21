import { supabase } from '../lib/supabase.ts'
import { validateFollowUpInput, validateOutcome } from '../followup/validation.ts'
import {
  FOLLOW_UP_OUTCOME_EFFECTS,
} from '../followup/types.ts'
import type {
  FollowUp,
  FollowUpInput,
  FollowUpOutcome,
  FollowUpSourceType,
  FollowUpStatus,
  FollowUpWithSource,
} from '../followup/types.ts'
import type { JobStatus, LeadStatus } from '../shared/types.ts'
import type { QuoteStatus } from '../quote/types.ts'
import { getLead, updateLeadStatus } from './leads.ts'
import { getQuote, updateQuoteStatus } from './quotes.ts'
import { getJob, updateJobStatus } from './jobs.ts'
import { ValidationError } from './errors.ts'
import { unwrap } from './unwrap.ts'

export const FOLLOW_UP_SELECT =
  '*, lead:leads(id,status,customer:customers(name)), quote:quotes(id,status,customer:customers(name)), job:jobs(id,status,customer:customers(name))'

interface JoinedSourceRow {
  id: string
  status: string
  customer: { name: string } | null
}

function toFollowUp(row: Record<string, unknown>): FollowUp {
  return {
    id: row.id as string,
    lead_id: (row.lead_id as string | null) ?? null,
    quote_id: (row.quote_id as string | null) ?? null,
    job_id: (row.job_id as string | null) ?? null,
    due_at: row.due_at as string,
    action: row.action as string,
    status: row.status as FollowUpStatus,
    owner_id: (row.owner_id as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    outcome: (row.outcome as FollowUpOutcome | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

function toFollowUpWithSource(row: Record<string, unknown>): FollowUpWithSource {
  const base = toFollowUp(row)
  const lead = row.lead as JoinedSourceRow | null
  const quote = row.quote as JoinedSourceRow | null
  const job = row.job as JoinedSourceRow | null

  let source: FollowUpWithSource['source']
  if (base.lead_id && lead) {
    source = { type: 'lead', id: lead.id, status: lead.status, customer_name: lead.customer?.name ?? null, href: `/leads/${lead.id}` }
  } else if (base.quote_id && quote) {
    source = { type: 'quote', id: quote.id, status: quote.status, customer_name: quote.customer?.name ?? null, href: `/quotes/${quote.id}` }
  } else if (base.job_id && job) {
    source = { type: 'job', id: job.id, status: job.status, customer_name: job.customer?.name ?? null, href: `/jobs/${job.id}` }
  } else {
    // Should never happen given the DB's exactly-one-source constraint; fall
    // back to something renderable rather than throwing.
    const type: FollowUpSourceType = base.lead_id ? 'lead' : base.quote_id ? 'quote' : 'job'
    const id = base.lead_id ?? base.quote_id ?? base.job_id ?? ''
    source = { type, id, status: 'unknown', customer_name: null, href: '/' }
  }

  return { ...base, source }
}

export interface ListFollowUpsOptions {
  status?: FollowUpStatus | 'all'
  ownerId?: string
  leadId?: string
  quoteId?: string
  jobId?: string
  dueBefore?: string
  limit?: number
}

export async function listFollowUps(options: ListFollowUpsOptions = {}): Promise<FollowUpWithSource[]> {
  let query = supabase.from('follow_ups').select(FOLLOW_UP_SELECT).order('due_at', { ascending: true })

  const status = options.status ?? 'open'
  if (status !== 'all') query = query.eq('status', status)
  if (options.ownerId) query = query.eq('owner_id', options.ownerId)
  if (options.leadId) query = query.eq('lead_id', options.leadId)
  if (options.quoteId) query = query.eq('quote_id', options.quoteId)
  if (options.jobId) query = query.eq('job_id', options.jobId)
  if (options.dueBefore) query = query.lt('due_at', options.dueBefore)
  if (options.limit) query = query.limit(options.limit)

  const rows = unwrap(await query)
  return (rows as unknown as Record<string, unknown>[]).map(toFollowUpWithSource)
}

export async function getFollowUp(id: string): Promise<FollowUpWithSource> {
  const row = unwrap(await supabase.from('follow_ups').select(FOLLOW_UP_SELECT).eq('id', id).single())
  return toFollowUpWithSource(row as unknown as Record<string, unknown>)
}

export async function listOpenFollowUpsForSource(type: FollowUpSourceType, id: string): Promise<FollowUpWithSource[]> {
  const column = type === 'lead' ? 'lead_id' : type === 'quote' ? 'quote_id' : 'job_id'
  const rows = unwrap(
    await supabase
      .from('follow_ups')
      .select(FOLLOW_UP_SELECT)
      .eq(column, id)
      .eq('status', 'open')
      .order('due_at', { ascending: true }),
  )
  return (rows as unknown as Record<string, unknown>[]).map(toFollowUpWithSource)
}

export async function createFollowUp(input: FollowUpInput): Promise<FollowUp> {
  const validated = validateFollowUpInput(input)
  if (!validated.ok) throw new ValidationError(validated.errors)

  const payload: Record<string, unknown> = {
    lead_id: validated.value.lead_id,
    quote_id: validated.value.quote_id,
    job_id: validated.value.job_id,
    due_at: validated.value.due_at,
    action: validated.value.action,
    notes: validated.value.notes,
  }
  // Only set owner_id when the caller passed one explicitly — otherwise
  // leave the key out of the insert so the column's DB default
  // (auth.uid()) applies.
  if (input.owner_id !== undefined) payload.owner_id = input.owner_id

  const row = unwrap(await supabase.from('follow_ups').insert(payload).select('*').single())
  return toFollowUp(row as unknown as Record<string, unknown>)
}

export async function updateFollowUp(
  id: string,
  patch: Partial<Pick<FollowUpInput, 'due_at' | 'action' | 'owner_id' | 'notes'>>,
): Promise<FollowUp> {
  const current = await getFollowUp(id)
  if (current.status !== 'open') {
    throw new ValidationError({ status: 'Only open follow-ups can be edited.' })
  }

  const merged: FollowUpInput = {
    lead_id: current.lead_id,
    quote_id: current.quote_id,
    job_id: current.job_id,
    due_at: current.due_at,
    action: current.action,
    owner_id: current.owner_id,
    notes: current.notes,
    ...patch,
  }

  const validated = validateFollowUpInput(merged)
  if (!validated.ok) throw new ValidationError(validated.errors)

  const row = unwrap(
    await supabase
      .from('follow_ups')
      .update({
        due_at: validated.value.due_at,
        action: validated.value.action,
        notes: validated.value.notes,
        owner_id: merged.owner_id ?? null,
      })
      .eq('id', id)
      .select('*')
      .single(),
  )
  return toFollowUp(row as unknown as Record<string, unknown>)
}

export async function cancelFollowUp(id: string): Promise<FollowUp> {
  const current = await getFollowUp(id)
  if (current.status !== 'open') {
    throw new ValidationError({ status: 'Only open follow-ups can be cancelled.' })
  }
  const row = unwrap(await supabase.from('follow_ups').update({ status: 'cancelled' }).eq('id', id).select('*').single())
  return toFollowUp(row as unknown as Record<string, unknown>)
}

function appendNote(existing: string | null, addition: string): string {
  const trimmed = addition.trim()
  return existing ? `${existing}\n${trimmed}` : trimmed
}

// Applies the source-record effect for a non-snooze outcome (see
// FOLLOW_UP_OUTCOME_EFFECTS in src/followup/types.ts). Returns whether the
// source was actually changed. Skips the write when the source is already
// in the target status, and applies the lead-specific "'contacted' only
// from 'new'" / quote-specific "'contacted' -> 'follow_up' only from
// 'presented'" guards. Errors from the underlying A/B functions (e.g. an
// invalid quote transition) propagate as ValidationError.
async function applySourceEffect(
  sourceType: FollowUpSourceType,
  current: FollowUpWithSource,
  targetStatus: string,
  lostReason: string | null,
): Promise<boolean> {
  if (sourceType === 'lead') {
    const leadId = current.lead_id as string
    const lead = await getLead(leadId)
    if (lead.status === targetStatus) return false
    if (targetStatus === 'contacted' && lead.status !== 'new') return false
    await updateLeadStatus(leadId, targetStatus as LeadStatus, lostReason)
    return true
  }

  if (sourceType === 'quote') {
    const quoteId = current.quote_id as string
    const quote = await getQuote(quoteId)
    if (quote.status === targetStatus) return false
    if (targetStatus === 'follow_up' && quote.status !== 'presented') return false
    await updateQuoteStatus(quoteId, targetStatus as QuoteStatus, lostReason)
    return true
  }

  const jobId = current.job_id as string
  const job = await getJob(jobId)
  if (job.status === targetStatus) return false
  await updateJobStatus(jobId, targetStatus as JobStatus)
  return true
}

export interface RecordFollowUpOutcomeInput {
  outcome: FollowUpOutcome
  lost_reason?: string | null
  snooze_until?: string | null
  notes?: string | null
}

export interface RecordFollowUpOutcomeResult {
  followUp: FollowUp
  sourceUpdated: boolean
}

// NOT atomic: the source record (lead/quote/job) is updated FIRST, then the
// follow-up is marked done. If the second step fails, the follow-up stays
// open and retryable — calling this again is safe because the source
// update is skipped once the source is already in the target status. See
// docs/workstream-c-data.md.
export async function recordFollowUpOutcome(
  id: string,
  input: RecordFollowUpOutcomeInput,
): Promise<RecordFollowUpOutcomeResult> {
  const current = await getFollowUp(id)
  if (current.status !== 'open') {
    throw new ValidationError({ status: 'Only open follow-ups can be resolved.' })
  }

  const sourceType = current.source.type
  const validated = validateOutcome({
    outcome: input.outcome,
    sourceType,
    lost_reason: input.lost_reason,
    snooze_until: input.snooze_until,
  })
  if (!validated.ok) throw new ValidationError(validated.errors)

  if (validated.value.outcome === 'snoozed') {
    const row = unwrap(
      await supabase
        .from('follow_ups')
        .update({
          due_at: validated.value.snooze_until,
          notes: input.notes != null && input.notes.trim() !== '' ? appendNote(current.notes, input.notes) : current.notes,
        })
        .eq('id', id)
        .select('*')
        .single(),
    )
    return { followUp: toFollowUp(row as unknown as Record<string, unknown>), sourceUpdated: false }
  }

  const targetStatus = FOLLOW_UP_OUTCOME_EFFECTS[sourceType][validated.value.outcome]
  let sourceUpdated = false
  if (targetStatus) {
    sourceUpdated = await applySourceEffect(sourceType, current, targetStatus, validated.value.lost_reason)
  }

  const notes = input.notes != null && input.notes.trim() !== '' ? appendNote(current.notes, input.notes) : current.notes

  const row = unwrap(
    await supabase
      .from('follow_ups')
      .update({
        status: 'done',
        outcome: validated.value.outcome,
        completed_at: new Date().toISOString(),
        notes,
      })
      .eq('id', id)
      .select('*')
      .single(),
  )

  return { followUp: toFollowUp(row as unknown as Record<string, unknown>), sourceUpdated }
}
