import { describe, expect, it } from 'vitest'
import { validateFollowUpInput, validateOutcome } from './validation.ts'

const LEAD_ID = '11111111-1111-1111-1111-111111111111'
const QUOTE_ID = '22222222-2222-2222-2222-222222222222'

describe('validateFollowUpInput', () => {
  it('accepts exactly one source id', () => {
    const result = validateFollowUpInput({ lead_id: LEAD_ID, due_at: '2026-09-22T00:00:00.000Z', action: 'Call back' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.lead_id).toBe(LEAD_ID)
      expect(result.value.quote_id).toBeNull()
      expect(result.value.job_id).toBeNull()
    }
  })

  it('rejects zero sources', () => {
    const result = validateFollowUpInput({ due_at: '2026-09-22T00:00:00.000Z', action: 'Call back' })
    expect(result.ok).toBe(false)
  })

  it('rejects two sources', () => {
    const result = validateFollowUpInput({
      lead_id: LEAD_ID,
      quote_id: QUOTE_ID,
      due_at: '2026-09-22T00:00:00.000Z',
      action: 'Call back',
    })
    expect(result.ok).toBe(false)
  })

  it('trims action and rejects blank action', () => {
    const blank = validateFollowUpInput({ lead_id: LEAD_ID, due_at: '2026-09-22T00:00:00.000Z', action: '   ' })
    expect(blank.ok).toBe(false)

    const trimmed = validateFollowUpInput({ lead_id: LEAD_ID, due_at: '2026-09-22T00:00:00.000Z', action: '  Call back  ' })
    expect(trimmed.ok).toBe(true)
    if (trimmed.ok) expect(trimmed.value.action).toBe('Call back')
  })

  it('rejects action over 500 characters', () => {
    const result = validateFollowUpInput({
      lead_id: LEAD_ID,
      due_at: '2026-09-22T00:00:00.000Z',
      action: 'x'.repeat(501),
    })
    expect(result.ok).toBe(false)
  })

  it('accepts action at exactly 500 characters', () => {
    const result = validateFollowUpInput({
      lead_id: LEAD_ID,
      due_at: '2026-09-22T00:00:00.000Z',
      action: 'x'.repeat(500),
    })
    expect(result.ok).toBe(true)
  })

  it('rejects an invalid due_at', () => {
    const result = validateFollowUpInput({ lead_id: LEAD_ID, due_at: 'not-a-date', action: 'Call back' })
    expect(result.ok).toBe(false)
  })

  it('normalizes blank notes to null and trims non-blank notes', () => {
    const blankNotes = validateFollowUpInput({
      lead_id: LEAD_ID,
      due_at: '2026-09-22T00:00:00.000Z',
      action: 'Call back',
      notes: '   ',
    })
    expect(blankNotes.ok).toBe(true)
    if (blankNotes.ok) expect(blankNotes.value.notes).toBeNull()

    const withNotes = validateFollowUpInput({
      lead_id: LEAD_ID,
      due_at: '2026-09-22T00:00:00.000Z',
      action: 'Call back',
      notes: '  left a voicemail  ',
    })
    expect(withNotes.ok).toBe(true)
    if (withNotes.ok) expect(withNotes.value.notes).toBe('left a voicemail')
  })
})

describe('validateOutcome', () => {
  it('requires a non-blank lost_reason for lost', () => {
    const missing = validateOutcome({ outcome: 'lost', sourceType: 'lead' })
    expect(missing.ok).toBe(false)

    const blank = validateOutcome({ outcome: 'lost', sourceType: 'lead', lost_reason: '   ' })
    expect(blank.ok).toBe(false)

    const ok = validateOutcome({ outcome: 'lost', sourceType: 'lead', lost_reason: 'Went with a competitor' })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.value.lost_reason).toBe('Went with a competitor')
  })

  it('does not require lost_reason for other outcomes', () => {
    const result = validateOutcome({ outcome: 'contacted', sourceType: 'lead' })
    expect(result.ok).toBe(true)
  })

  it('requires a valid, future snooze_until for snoozed', () => {
    const now = new Date(2026, 8, 21, 12, 0, 0)

    const missing = validateOutcome({ outcome: 'snoozed', sourceType: 'lead' }, now)
    expect(missing.ok).toBe(false)

    const invalid = validateOutcome({ outcome: 'snoozed', sourceType: 'lead', snooze_until: 'not-a-date' }, now)
    expect(invalid.ok).toBe(false)

    const past = validateOutcome(
      { outcome: 'snoozed', sourceType: 'lead', snooze_until: new Date(2026, 8, 21, 11, 0, 0).toISOString() },
      now,
    )
    expect(past.ok).toBe(false)

    const exactlyNow = validateOutcome({ outcome: 'snoozed', sourceType: 'lead', snooze_until: now.toISOString() }, now)
    expect(exactlyNow.ok).toBe(false)

    const future = validateOutcome(
      { outcome: 'snoozed', sourceType: 'lead', snooze_until: new Date(2026, 8, 21, 13, 0, 0).toISOString() },
      now,
    )
    expect(future.ok).toBe(true)
  })
})
