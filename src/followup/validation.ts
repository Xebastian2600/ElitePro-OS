// Pure validation/normalization helpers for follow-ups — no Supabase import.
// Mirrors the pattern in src/shared/validation.ts.

import type { FollowUpInput, FollowUpOutcome, FollowUpSourceType } from './types.ts'

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> }

const ACTION_MAX_LENGTH = 500

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export interface NormalizedFollowUpInput {
  lead_id: string | null
  quote_id: string | null
  job_id: string | null
  due_at: string
  action: string
  owner_id: string | null
  notes: string | null
}

export function validateFollowUpInput(input: FollowUpInput): ValidationResult<NormalizedFollowUpInput> {
  const errors: Record<string, string> = {}

  const lead_id = emptyToNull(input.lead_id ?? null)
  const quote_id = emptyToNull(input.quote_id ?? null)
  const job_id = emptyToNull(input.job_id ?? null)
  const sourceCount = [lead_id, quote_id, job_id].filter((v) => v != null).length
  if (sourceCount !== 1) {
    errors._ = 'Exactly one of lead, quote, or job is required.'
  }

  const action = (input.action ?? '').trim()
  if (!action) {
    errors.action = 'Action is required.'
  } else if (action.length > ACTION_MAX_LENGTH) {
    errors.action = `Action must be ${ACTION_MAX_LENGTH} characters or fewer.`
  }

  let due_at = ''
  if (!input.due_at || isNaN(new Date(input.due_at).getTime())) {
    errors.due_at = 'A valid due date is required.'
  } else {
    due_at = input.due_at
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      lead_id,
      quote_id,
      job_id,
      due_at,
      action,
      owner_id: emptyToNull(input.owner_id ?? null),
      notes: emptyToNull(input.notes),
    },
  }
}

export interface OutcomeInput {
  outcome: FollowUpOutcome
  sourceType: FollowUpSourceType
  lost_reason?: string | null
  snooze_until?: string | null
}

export interface NormalizedOutcome {
  outcome: FollowUpOutcome
  lost_reason: string | null
  snooze_until: string | null
}

// `now` defaults to the real clock but is overridable for deterministic
// tests of the "snooze_until must be in the future" rule.
export function validateOutcome(input: OutcomeInput, now: Date = new Date()): ValidationResult<NormalizedOutcome> {
  const errors: Record<string, string> = {}

  const lost_reason = emptyToNull(input.lost_reason)
  if (input.outcome === 'lost' && !lost_reason) {
    errors.lost_reason = 'Lost reason is required.'
  }

  let snooze_until: string | null = null
  if (input.outcome === 'snoozed') {
    const parsed = input.snooze_until ? new Date(input.snooze_until) : null
    if (!parsed || isNaN(parsed.getTime())) {
      errors.snooze_until = 'A valid snooze date is required.'
    } else if (parsed.getTime() <= now.getTime()) {
      errors.snooze_until = 'Snooze date must be in the future.'
    } else {
      snooze_until = input.snooze_until as string
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      outcome: input.outcome,
      lost_reason: input.outcome === 'lost' ? lost_reason : null,
      snooze_until,
    },
  }
}
