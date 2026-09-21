import { describe, expect, it } from 'vitest'
import { describeActivity, entityHref, entityLabel } from './describeActivity.ts'
import type { Activity } from '../../shared/types.ts'

function activity(overrides: Partial<Activity>): Activity {
  return {
    id: 'act-1',
    entity_type: 'lead',
    entity_id: 'entity-1',
    actor_id: 'user-1',
    action: 'lead.created',
    metadata: {},
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('describeActivity', () => {
  it('describes a lead created action', () => {
    expect(describeActivity(activity({ entity_type: 'lead', action: 'lead.created' }))).toBe('Lead created')
  })

  it('describes a lead status change with label lookup', () => {
    const result = describeActivity(
      activity({ entity_type: 'lead', action: 'lead.status_changed', metadata: { from: 'new', to: 'booked' } }),
    )
    expect(result).toBe('Status changed from New to Booked')
  })

  it('describes a quote status change with label lookup', () => {
    const result = describeActivity(
      activity({ entity_type: 'quote', action: 'quote.status_changed', metadata: { from: 'draft', to: 'presented' } }),
    )
    expect(result).toBe('Status changed from Draft to Presented')
  })

  it('describes a job status change with label lookup', () => {
    const result = describeActivity(
      activity({ entity_type: 'job', action: 'job.status_changed', metadata: { from: 'scheduled', to: 'completed' } }),
    )
    expect(result).toBe('Status changed from Scheduled to Completed')
  })

  it('describes a job created action', () => {
    expect(describeActivity(activity({ entity_type: 'job', action: 'job.created' }))).toBe('Job created')
  })

  it('describes a follow_up.created action with the action text', () => {
    const result = describeActivity(
      activity({ entity_type: 'follow_up', action: 'follow_up.created', metadata: { action: 'Call customer' } }),
    )
    expect(result).toBe('Follow-up created: Call customer')
  })

  it('describes a follow_up.created action with no action text', () => {
    const result = describeActivity(activity({ entity_type: 'follow_up', action: 'follow_up.created', metadata: {} }))
    expect(result).toBe('Follow-up created')
  })

  it('describes a follow_up done status change with the outcome', () => {
    const result = describeActivity(
      activity({
        entity_type: 'follow_up',
        action: 'follow_up.status_changed',
        metadata: { from: 'open', to: 'done', changed: ['status', 'outcome', 'completed_at'], after: { outcome: 'contacted' } },
      }),
    )
    expect(result).toBe('Follow-up done (contacted)')
  })

  it('describes a follow_up cancelled status change', () => {
    const result = describeActivity(
      activity({
        entity_type: 'follow_up',
        action: 'follow_up.status_changed',
        metadata: { from: 'open', to: 'cancelled', changed: ['status'], after: {} },
      }),
    )
    expect(result).toBe('Follow-up cancelled')
  })

  it('describes a follow_up.updated with due_at changed as a reschedule (snooze)', () => {
    const result = describeActivity(
      activity({
        entity_type: 'follow_up',
        action: 'follow_up.updated',
        metadata: { changed: ['due_at'], before: {}, after: {} },
      }),
    )
    expect(result).toBe('Follow-up rescheduled')
  })

  it('describes a follow_up.updated without due_at changed by listing the changed fields', () => {
    const result = describeActivity(
      activity({
        entity_type: 'follow_up',
        action: 'follow_up.updated',
        metadata: { changed: ['action', 'notes'], before: {}, after: {} },
      }),
    )
    expect(result).toBe('Follow-up updated: action, notes')
  })

  it('falls back to the raw action string for an unrecognized action', () => {
    expect(describeActivity(activity({ action: 'lead.something_unusual' }))).toBe('lead.something_unusual')
  })
})

describe('entityLabel', () => {
  it('labels every entity type', () => {
    expect(entityLabel('customer')).toBe('Customer')
    expect(entityLabel('vehicle')).toBe('Vehicle')
    expect(entityLabel('lead')).toBe('Lead')
    expect(entityLabel('job')).toBe('Job')
    expect(entityLabel('quote')).toBe('Quote')
    expect(entityLabel('pricing_rule')).toBe('Pricing rule')
    expect(entityLabel('follow_up')).toBe('Follow-up')
  })
})

describe('entityHref', () => {
  it('links to the entity page for lead/quote/job/customer', () => {
    expect(entityHref(activity({ entity_type: 'lead', entity_id: 'l1' }))).toBe('/leads/l1')
    expect(entityHref(activity({ entity_type: 'quote', entity_id: 'q1' }))).toBe('/quotes/q1')
    expect(entityHref(activity({ entity_type: 'job', entity_id: 'j1' }))).toBe('/jobs/j1')
    expect(entityHref(activity({ entity_type: 'customer', entity_id: 'c1' }))).toBe('/customers/c1')
  })

  it('links pricing_rule activity to the pricing settings page', () => {
    expect(entityHref(activity({ entity_type: 'pricing_rule', entity_id: 'pr1' }))).toBe('/settings/pricing')
  })

  it('returns null for vehicle and follow_up (no standalone page)', () => {
    expect(entityHref(activity({ entity_type: 'vehicle', entity_id: 'v1' }))).toBeNull()
    expect(entityHref(activity({ entity_type: 'follow_up', entity_id: 'f1' }))).toBeNull()
  })
})
