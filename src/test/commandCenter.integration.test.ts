// Runs against a local Supabase instance (see .env.test.local / vitest.integration.config.ts).
// Start it with `npx supabase start`, then `npm run test:integration`.

import { beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase.ts'
import { createCustomer } from '../data/customers.ts'
import { createVehicle } from '../data/vehicles.ts'
import { createLead, getLead, updateLeadStatus } from '../data/leads.ts'
import { createJob, createJobFromQuote, updateJobStatus } from '../data/jobs.ts'
import { createQuote, getQuote, saveQuote, updateQuoteStatus } from '../data/quotes.ts'
import { getPricingConfig, setPricingRule } from '../data/pricingRules.ts'
import { listActivityForEntity } from '../data/activity.ts'
import { listActivityFeed } from '../data/activityFeed.ts'
import { listTeamMembers } from '../data/team.ts'
import {
  cancelFollowUp,
  createFollowUp,
  getFollowUp,
  listFollowUps,
  listOpenFollowUpsForSource,
  recordFollowUpOutcome,
  updateFollowUp,
} from '../data/followUps.ts'
import { getCommandCenterMetrics, listTodayBoard } from '../data/metrics.ts'
import { listIntegrationEvents, logIntegrationEvent } from '../data/integrationEvents.ts'
import { ValidationError } from '../data/errors.ts'
import type { Customer, Vehicle } from '../shared/types.ts'
import type { PricingConfig } from '../quote/types.ts'

const RUN = String(Math.floor(1000 + Math.random() * 9000))

let userId: string
let userEmail: string
let testStartIso: string

beforeAll(async () => {
  testStartIso = new Date().toISOString()
  const email = `test-cc-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  const { data, error } = await supabase.auth.signUp({ email, password: 'password123!' })
  if (error) throw error
  if (!data.user) throw new Error('signUp did not return a user (local auth should auto-confirm).')
  userId = data.user.id
  userEmail = email
})

let phoneSeq = 0
function nextPhone(): string {
  phoneSeq += 1
  return `(555) ${100 + phoneSeq}-${RUN}`
}

async function makeCustomerVehicle(tag: string): Promise<{ customer: Customer; vehicle: Vehicle }> {
  const customer = await createCustomer({ name: `CC ${tag} ${RUN}`, phone: nextPhone() })
  const vehicle = await createVehicle({ customer_id: customer.id, year: 2020, make: 'Toyota', model: 'Corolla' })
  return { customer, vehicle }
}

async function makeLead(tag: string) {
  const { customer, vehicle } = await makeCustomerVehicle(tag)
  const lead = await createLead({ customer_id: customer.id, vehicle_id: vehicle.id, source: 'web', request: 'Windshield' })
  return { customer, vehicle, lead }
}

describe('command center metrics', () => {
  let config: PricingConfig

  beforeAll(async () => {
    await setPricingRule('tax', { rate: 0.08, taxable_types: ['glass', 'labor', 'adas', 'part'] })
    await setPricingRule('price.glass', { mode: 'fixed', value: 300 })
    config = await getPricingConfig()
  })

  it('reflects exact deltas from real mutations', async () => {
    const now = new Date()
    const before = await getCommandCenterMetrics('today', now)

    const { lead: leadToBook } = await makeLead('metrics-book')
    const { lead: leadToLose } = await makeLead('metrics-lose')
    const { customer: qCustomer, vehicle: qVehicle } = await makeCustomerVehicle('metrics-quote')
    const quote = await createQuote({ customer_id: qCustomer.id, vehicle_id: qVehicle.id })

    await updateLeadStatus(leadToBook.id, 'booked')
    await updateLeadStatus(leadToLose.id, 'lost', 'No budget')

    // A follow-up so follow_ups_overdue / follow_ups_open deltas are checkable.
    const followUp = await createFollowUp({
      lead_id: leadToBook.id,
      due_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      action: 'Confirm booking details',
    })

    await saveQuote(
      quote.id,
      { items: [{ type: 'glass', description: 'Windshield', quantity: 1, unit_cost: 100, unit_price: 300 }], notes: null },
      config,
    )
    await updateQuoteStatus(quote.id, 'presented')
    await updateQuoteStatus(quote.id, 'approved')
    const job = await createJobFromQuote({
      quote_id: quote.id,
      customer_id: qCustomer.id,
      vehicle_id: qVehicle.id,
      appointment_at: now.toISOString(),
    })
    await updateJobStatus(job.id, 'completed')

    const after = await getCommandCenterMetrics('today', now)

    expect(after.leads_created - before.leads_created).toBe(2)
    expect(after.quotes_created - before.quotes_created).toBe(1)
    expect(after.jobs_created - before.jobs_created).toBe(1)
    expect(after.leads_booked - before.leads_booked).toBe(1)
    expect(after.leads_lost - before.leads_lost).toBe(1)
    expect(after.jobs_completed - before.jobs_completed).toBe(1)
    // Net 0: two leads opened, then one booked + one lost — the open set is unchanged.
    expect(after.leads_open - before.leads_open).toBe(0)
    // Net 0: the quote went draft -> presented -> approved, so it's no longer "open"
    // by the time we read `after`.
    expect(after.quotes_open - before.quotes_open).toBe(0)
    // Net 0: the job briefly qualified as "scheduled" (appointment today, not yet
    // completed) but we complete it before reading `after`, which excludes it.
    expect(after.jobs_scheduled - before.jobs_scheduled).toBe(0)
    expect(after.follow_ups_overdue - before.follow_ups_overdue).toBe(1)
    expect(after.follow_ups_open - before.follow_ups_open).toBe(1)
    expect(after.conversion_rate).not.toBeNull()
    expect(after.conversion_rate as number).toBeGreaterThanOrEqual(0)
    expect(after.conversion_rate as number).toBeLessThanOrEqual(1)

    await cancelFollowUp(followUp.id)
  })

  it('listTodayBoard returns the expected shape without error', async () => {
    const board = await listTodayBoard()
    expect(Array.isArray(board.leadsToday)).toBe(true)
    expect(Array.isArray(board.quotesOpen)).toBe(true)
    expect(Array.isArray(board.jobsToday)).toBe(true)
    expect(Array.isArray(board.followUpsDue)).toBe(true)
  })
})

describe('follow-ups', () => {
  it('creates a follow-up for a lead, a quote, and a job', async () => {
    const { lead } = await makeLead('fu-lead')
    const followUp = await createFollowUp({ lead_id: lead.id, due_at: new Date().toISOString(), action: 'Call lead' })
    expect(followUp.lead_id).toBe(lead.id)
    expect(followUp.status).toBe('open')

    const { customer, vehicle } = await makeCustomerVehicle('fu-quote')
    const quote = await createQuote({ customer_id: customer.id, vehicle_id: vehicle.id })
    const quoteFollowUp = await createFollowUp({ quote_id: quote.id, due_at: new Date().toISOString(), action: 'Follow up on quote' })
    expect(quoteFollowUp.quote_id).toBe(quote.id)

    const job = await createJob({ customer_id: customer.id, vehicle_id: vehicle.id })
    const jobFollowUp = await createFollowUp({ job_id: job.id, due_at: new Date().toISOString(), action: 'Confirm job' })
    expect(jobFollowUp.job_id).toBe(job.id)

    const forJob = await listOpenFollowUpsForSource('job', job.id)
    expect(forJob.some((f) => f.id === jobFollowUp.id)).toBe(true)
    expect(forJob[0].source.type).toBe('job')
    expect(forJob[0].source.customer_name).toBe(customer.name)
  })

  it('enforces exactly one source client-side and at the DB', async () => {
    const { lead } = await makeLead('fu-one-source-a')
    const { customer, vehicle } = await makeCustomerVehicle('fu-one-source-b')
    const quote = await createQuote({ customer_id: customer.id, vehicle_id: vehicle.id })

    await expect(
      createFollowUp({ lead_id: lead.id, quote_id: quote.id, due_at: new Date().toISOString(), action: 'x' }),
    ).rejects.toBeInstanceOf(ValidationError)

    await expect(createFollowUp({ due_at: new Date().toISOString(), action: 'x' })).rejects.toBeInstanceOf(ValidationError)

    const { error } = await supabase
      .from('follow_ups')
      .insert({ lead_id: lead.id, quote_id: quote.id, due_at: new Date().toISOString(), action: 'sneaky' })
    expect(error).not.toBeNull()
  })

  it('lists open follow-ups ordered by due_at ascending', async () => {
    const { lead } = await makeLead('fu-order')
    const now = new Date()
    const overdue = await createFollowUp({
      lead_id: lead.id,
      due_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      action: 'Overdue item',
    })
    const dueToday = await createFollowUp({
      lead_id: lead.id,
      due_at: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
      action: 'Due soon item',
    })
    const upcoming = await createFollowUp({
      lead_id: lead.id,
      due_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      action: 'Upcoming item',
    })

    const all = await listFollowUps({ ownerId: userId, status: 'open', limit: 500 })
    const ids = [overdue.id, dueToday.id, upcoming.id]
    const ours = all.filter((f) => ids.includes(f.id)).map((f) => f.id)
    expect(ours).toEqual(ids)

    await cancelFollowUp(overdue.id)
    await cancelFollowUp(dueToday.id)
    await cancelFollowUp(upcoming.id)
  })

  it('snoozes: moves due_at, stays open, leaves outcome null', async () => {
    const { lead } = await makeLead('fu-snooze')
    const followUp = await createFollowUp({ lead_id: lead.id, due_at: new Date().toISOString(), action: 'Call back' })
    const snoozeUntilIso = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()

    const result = await recordFollowUpOutcome(followUp.id, { outcome: 'snoozed', snooze_until: snoozeUntilIso })
    expect(result.sourceUpdated).toBe(false)
    expect(result.followUp.status).toBe('open')
    expect(result.followUp.outcome).toBeNull()
    expect(new Date(result.followUp.due_at).getTime()).toBe(new Date(snoozeUntilIso).getTime())

    const lead2 = await getLead(lead.id)
    expect(lead2.status).toBe('new')
  })

  it('contacted on a new lead moves the lead to contacted and completes the follow-up', async () => {
    const { lead } = await makeLead('fu-contacted')
    const followUp = await createFollowUp({ lead_id: lead.id, due_at: new Date().toISOString(), action: 'Call lead' })

    const result = await recordFollowUpOutcome(followUp.id, { outcome: 'contacted', notes: 'left a voicemail' })
    expect(result.sourceUpdated).toBe(true)
    expect(result.followUp.status).toBe('done')
    expect(result.followUp.outcome).toBe('contacted')
    expect(result.followUp.completed_at).not.toBeNull()
    expect(result.followUp.notes).toBe('left a voicemail')

    const updatedLead = await getLead(lead.id)
    expect(updatedLead.status).toBe('contacted')

    await expect(updateFollowUp(followUp.id, { action: 'edit a done follow-up' })).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects lost without a reason, leaving the follow-up open and the lead untouched', async () => {
    const { lead } = await makeLead('fu-lost-no-reason')
    const followUp = await createFollowUp({ lead_id: lead.id, due_at: new Date().toISOString(), action: 'Call lead' })

    await expect(recordFollowUpOutcome(followUp.id, { outcome: 'lost' })).rejects.toBeInstanceOf(ValidationError)

    const stillOpen = await getFollowUp(followUp.id)
    expect(stillOpen.status).toBe('open')
    const stillNew = await getLead(lead.id)
    expect(stillNew.status).toBe('new')
  })

  it('lost with a reason moves the lead to lost', async () => {
    const { lead } = await makeLead('fu-lost-with-reason')
    const followUp = await createFollowUp({ lead_id: lead.id, due_at: new Date().toISOString(), action: 'Call lead' })

    const result = await recordFollowUpOutcome(followUp.id, { outcome: 'lost', lost_reason: 'Went with a competitor' })
    expect(result.sourceUpdated).toBe(true)
    expect(result.followUp.outcome).toBe('lost')

    const updatedLead = await getLead(lead.id)
    expect(updatedLead.status).toBe('lost')
    expect(updatedLead.lost_reason).toBe('Went with a competitor')
  })

  it('booked on a presented quote approves the quote', async () => {
    const { customer, vehicle } = await makeCustomerVehicle('fu-quote-booked')
    const quote = await createQuote({ customer_id: customer.id, vehicle_id: vehicle.id })
    const config = await getPricingConfig()
    await saveQuote(
      quote.id,
      { items: [{ type: 'glass', description: 'Windshield', quantity: 1, unit_cost: 100, unit_price: 300 }], notes: null },
      config,
    )
    await updateQuoteStatus(quote.id, 'presented')

    const followUp = await createFollowUp({ quote_id: quote.id, due_at: new Date().toISOString(), action: 'Follow up on quote' })
    const result = await recordFollowUpOutcome(followUp.id, { outcome: 'booked' })
    expect(result.sourceUpdated).toBe(true)
    expect(result.followUp.status).toBe('done')

    const updatedQuote = await getQuote(quote.id)
    expect(updatedQuote.status).toBe('approved')
  })

  it('an invalid quote transition propagates as ValidationError and leaves the follow-up open', async () => {
    const { customer, vehicle } = await makeCustomerVehicle('fu-quote-invalid')
    // Draft quote with no items: draft -> approved is not an allowed transition
    // (QUOTE_TRANSITIONS.draft = ['presented', 'lost']), so this must fail.
    const quote = await createQuote({ customer_id: customer.id, vehicle_id: vehicle.id })
    const followUp = await createFollowUp({ quote_id: quote.id, due_at: new Date().toISOString(), action: 'Follow up on quote' })

    await expect(recordFollowUpOutcome(followUp.id, { outcome: 'booked' })).rejects.toBeInstanceOf(ValidationError)

    const stillOpen = await getFollowUp(followUp.id)
    expect(stillOpen.status).toBe('open')
    const stillDraft = await getQuote(quote.id)
    expect(stillDraft.status).toBe('draft')
  })

  it('cancels an open follow-up and refuses to cancel it again', async () => {
    const { lead } = await makeLead('fu-cancel')
    const followUp = await createFollowUp({ lead_id: lead.id, due_at: new Date().toISOString(), action: 'Call lead' })

    const cancelled = await cancelFollowUp(followUp.id)
    expect(cancelled.status).toBe('cancelled')

    await expect(cancelFollowUp(followUp.id)).rejects.toBeInstanceOf(ValidationError)
    await expect(updateFollowUp(followUp.id, { action: 'edit a cancelled follow-up' })).rejects.toBeInstanceOf(ValidationError)
  })

  it('logs follow_up.created / follow_up.updated activity attributed to the signed-in user', async () => {
    const { lead } = await makeLead('fu-activity')
    const followUp = await createFollowUp({ lead_id: lead.id, due_at: new Date().toISOString(), action: 'Call lead' })
    await recordFollowUpOutcome(followUp.id, { outcome: 'contacted' })

    const activity = await listActivityForEntity('follow_up', followUp.id, 50)
    const actions = activity.map((a) => a.action)
    expect(actions).toContain('follow_up.created')
    expect(actions).toContain('follow_up.status_changed')
    for (const row of activity) expect(row.actor_id).toBe(userId)
  })
})

describe('activity feed', () => {
  it('filters by entityTypes, actorId, and date range', async () => {
    const { lead } = await makeLead('feed')
    await updateLeadStatus(lead.id, 'contacted')

    const byEntityType = await listActivityFeed({ entityTypes: ['lead'], actorId: userId, limit: 500 })
    expect(byEntityType.length).toBeGreaterThan(0)
    for (const row of byEntityType) {
      expect(row.entity_type).toBe('lead')
      expect(row.actor_id).toBe(userId)
    }
    expect(byEntityType.some((a) => a.entity_id === lead.id && a.action === 'lead.status_changed')).toBe(true)

    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const ranged = await listActivityFeed({ from: testStartIso, to: future, actorId: userId, limit: 500 })
    expect(ranged.length).toBeGreaterThan(0)
    for (const row of ranged) {
      expect(row.created_at >= testStartIso).toBe(true)
      expect(row.created_at < future).toBe(true)
    }
  })

  it('reflects A/B (lead/quote/job) actions immediately after they happen', async () => {
    const { lead } = await makeLead('feed-immediate')
    await updateLeadStatus(lead.id, 'contacted')

    const feed = await listActivityFeed({ entityTypes: ['lead'], actorId: userId, limit: 20 })
    expect(feed.some((a) => a.entity_id === lead.id && a.action === 'lead.status_changed')).toBe(true)
  })
})

describe('list_team_members', () => {
  it('returns the signed-in test user', async () => {
    const members = await listTeamMembers()
    expect(members.some((m) => m.id === userId && m.email === userEmail)).toBe(true)
  })

  it('cannot be called by a signed-out anon client', async () => {
    const anonClient = createClient(
      import.meta.env.VITE_SUPABASE_URL as string,
      import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    )
    const { error } = await anonClient.rpc('list_team_members')
    expect(error).not.toBeNull()
  })
})

describe('integration_events', () => {
  it('inserts and lists events', async () => {
    const event = await logIntegrationEvent({
      source: 'manual',
      direction: 'inbound',
      event_type: `test.event.${RUN}`,
      payload: { foo: 'bar' },
    })
    expect(event.status).toBe('received')
    expect(event.actor_id).toBe(userId)

    const list = await listIntegrationEvents({ source: 'manual', limit: 500 })
    expect(list.some((e) => e.id === event.id)).toBe(true)
  })

  it('rejects an invalid source client-side before touching the DB', async () => {
    await expect(
      logIntegrationEvent({ source: 'bogus' as never, direction: 'inbound', event_type: 'x' }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects an update at the DB (append-only log)', async () => {
    const event = await logIntegrationEvent({ source: 'manual', direction: 'outbound', event_type: `test.event2.${RUN}` })
    const { error } = await supabase.from('integration_events').update({ status: 'processed' }).eq('id', event.id)
    expect(error).not.toBeNull()
  })
})

describe('audit and finality guards', () => {
  let leadId: string

  beforeAll(async () => {
    const customer = await createCustomer({ name: 'Guard Customer', phone: `(555) 700-${RUN}` })
    const lead = await createLead({ customer_id: customer.id, request: 'guard test' })
    leadId = lead.id
  })

  it('stamps created_by from the session, ignoring a spoofed value', async () => {
    const { data, error } = await supabase
      .from('follow_ups')
      .insert({ lead_id: leadId, due_at: new Date().toISOString(), action: 'Call', created_by: crypto.randomUUID() })
      .select('created_by')
      .single()
    expect(error).toBeNull()
    expect(data?.created_by).toBe(userId)
  })

  it('refuses a direct update that reopens a done follow-up', async () => {
    const followUp = await createFollowUp({ lead_id: leadId, due_at: new Date().toISOString(), action: 'Call back' })
    await recordFollowUpOutcome(followUp.id, { outcome: 'contacted' })
    const { error } = await supabase
      .from('follow_ups')
      .update({ status: 'open', outcome: null, completed_at: null })
      .eq('id', followUp.id)
    expect(error).not.toBeNull()
  })

  it('stamps integration event actor_id from the session', async () => {
    const { data, error } = await supabase
      .from('integration_events')
      .insert({ source: 'manual', direction: 'inbound', event_type: `guard.${RUN}`, actor_id: crypto.randomUUID() })
      .select('actor_id')
      .single()
    expect(error).toBeNull()
    expect(data?.actor_id).toBe(userId)
  })
})
