// Runs against a local Supabase instance (see .env.test.local / vitest.integration.config.ts).
// Start it with `npx supabase start`, then `npm run test:integration`.

import { beforeAll, describe, expect, it } from 'vitest'
import { supabase } from '../lib/supabase.ts'
import { createCustomer } from '../data/customers.ts'
import { createVehicle } from '../data/vehicles.ts'
import { createLead, getLead } from '../data/leads.ts'
import { createJobFromQuote } from '../data/jobs.ts'
import { listActivityForEntity } from '../data/activity.ts'
import { getPricingConfig, listPricingRuleRows, setPricingRule } from '../data/pricingRules.ts'
import { createQuote, getQuoteWithItems, recalculateStoredQuote, saveQuote, updateQuoteStatus } from '../data/quotes.ts'
import { ValidationError } from '../data/errors.ts'
import type { Customer, Vehicle } from '../shared/types.ts'
import type { PricingConfig, PricingRuleRow, QuoteItem, QuoteItemInput } from '../quote/types.ts'

const RUN = String(Math.floor(1000 + Math.random() * 9000))

let userId: string

beforeAll(async () => {
  const email = `test-quote-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  const { data, error } = await supabase.auth.signUp({ email, password: 'password123!' })
  if (error) throw error
  if (!data.user) throw new Error('signUp did not return a user (local auth should auto-confirm).')
  userId = data.user.id
})

function toInput(item: QuoteItem): QuoteItemInput {
  return {
    id: item.id,
    type: item.type,
    description: item.description,
    quantity: item.quantity,
    unit_cost: item.unit_cost,
    unit_price: item.unit_price,
    metadata: item.metadata,
  }
}

describe('pricing rules', () => {
  let taxRuleId: string

  it('rejects an invalid value client-side, before touching the DB', async () => {
    await expect(setPricingRule('tax', { rate: 2, taxable_types: ['glass'] })).rejects.toBeInstanceOf(ValidationError)
  })

  it('sets tax and price.glass rules', async () => {
    const tax = await setPricingRule('tax', { rate: 0.0825, taxable_types: ['glass', 'labor', 'adas', 'part'] })
    expect(tax.key).toBe('tax')
    expect(tax.active_to).toBeNull()
    taxRuleId = tax.id

    const glass = await setPricingRule('price.glass', { mode: 'fixed', value: 300 })
    expect(glass.key).toBe('price.glass')
  })

  it('resolves both rules through getPricingConfig', async () => {
    const config = await getPricingConfig()
    expect(config.rules.tax?.value.rate).toBe(0.0825)
    expect(config.rules['price.glass']?.value).toEqual({ mode: 'fixed', value: 300 })
    expect(config.issues).toEqual([])
  })

  it('setting tax twice closes the previously open row (one open row per key)', async () => {
    await setPricingRule('tax', { rate: 0.07, taxable_types: ['glass'] })

    const rows: PricingRuleRow[] = await listPricingRuleRows()
    const taxRows = rows.filter((r) => r.key === 'tax')
    const open = taxRows.filter((r) => r.active_to === null)
    expect(open.length).toBe(1)
    expect(open[0].value).toEqual({ rate: 0.07, taxable_types: ['glass'] })

    const closed = taxRows.find((r) => r.id === taxRuleId)
    expect(closed?.active_to).not.toBeNull()

    // Restore a broader taxable_types set for the quote-engine tests below.
    await setPricingRule('tax', { rate: 0.0825, taxable_types: ['glass', 'labor', 'adas', 'part'] })
  })

  it('logs pricing_rule.created activity attributed to the signed-in user', async () => {
    // Use the rule this run created — other rows may belong to earlier runs' users.
    const activity = await listActivityForEntity('pricing_rule', taxRuleId)
    expect(activity.some((a) => a.action === 'pricing_rule.created')).toBe(true)
    for (const row of activity) expect(row.actor_id).toBe(userId)
  })
})

describe('quote engine flow', () => {
  let customerA: Customer
  let customerB: Customer
  let vehicleA: Vehicle
  let vehicleB: Vehicle
  let leadId: string
  let quoteId: string
  let pricingConfig: PricingConfig

  it('creates customers, vehicles, and a lead via Workstream A', async () => {
    customerA = await createCustomer({ name: 'Quote Customer', phone: `(555) 100-${RUN}` })
    customerB = await createCustomer({ name: 'Other Quote Customer', phone: `(555) 200-${RUN}` })
    vehicleA = await createVehicle({ customer_id: customerA.id, year: 2019, make: 'Toyota', model: 'Camry' })
    vehicleB = await createVehicle({ customer_id: customerB.id, year: 2021, make: 'Ford', model: 'F-150' })

    const lead = await createLead({
      customer_id: customerA.id,
      vehicle_id: vehicleA.id,
      source: 'web',
      request: 'Windshield replacement',
    })
    leadId = lead.id
  })

  it('creates a quote from the lead', async () => {
    const quote = await createQuote({ customer_id: customerA.id, vehicle_id: vehicleA.id, lead_id: leadId })
    expect(quote.status).toBe('draft')
    expect(quote.customer_id).toBe(customerA.id)
    expect(quote.lead_id).toBe(leadId)
    quoteId = quote.id
  })

  it('rejects a quote whose lead belongs to a different customer', async () => {
    await expect(
      createQuote({ customer_id: customerB.id, vehicle_id: vehicleB.id, lead_id: leadId }),
    ).rejects.toThrow()
  })

  it('rejects a quote whose vehicle belongs to a different customer', async () => {
    await expect(createQuote({ customer_id: customerA.id, vehicle_id: vehicleB.id })).rejects.toThrow()
  })

  it('saves glass/labor/adas/part/discount items and recalculates totals', async () => {
    pricingConfig = await getPricingConfig()

    const items: QuoteItemInput[] = [
      { type: 'glass', description: 'Windshield', quantity: 1, unit_cost: 150, unit_price: 300 },
      { type: 'labor', description: 'Install labor', quantity: 2, unit_cost: null, unit_price: 50 },
      { type: 'adas', description: 'ADAS calibration', quantity: 1, unit_cost: 80, unit_price: 150 },
      { type: 'part', description: 'Moulding clips', quantity: 4, unit_cost: 2, unit_price: 5 },
      { type: 'discount', description: 'Loyalty discount', quantity: 1, unit_cost: null, unit_price: 0, metadata: { percent: 10 } },
    ]

    const { quote, items: saved } = await saveQuote(quoteId, { items, notes: 'First draft' }, pricingConfig)
    expect(saved).toHaveLength(5)
    expect(saved.map((i) => i.description)).toEqual([
      'Windshield',
      'Install labor',
      'ADAS calibration',
      'Moulding clips',
      'Loyalty discount',
    ])
    expect(quote.notes).toBe('First draft')
    expect(quote.total).toBeCloseTo(quote.subtotal + quote.tax, 2)
  })

  it('reloads to exactly the saved items and totals', async () => {
    const { quote, items } = await getQuoteWithItems(quoteId)
    expect(items).toHaveLength(5)

    const recalced = recalculateStoredQuote(quote, items)
    expect(quote.subtotal).toBe(recalced.subtotal)
    expect(quote.tax).toBe(recalced.tax)
    expect(quote.total).toBe(recalced.total)
  })

  it('edits items (change a qty, remove one, add one) and reload matches', async () => {
    const { items: current } = await getQuoteWithItems(quoteId)
    const glassItem = current.find((i) => i.type === 'glass')!

    const nextItems: QuoteItemInput[] = current
      .filter((i) => i.type !== 'part')
      .map((i) => (i.id === glassItem.id ? { ...toInput(i), quantity: 2 } : toInput(i)))
    nextItems.push({ type: 'labor', description: 'Extra labor', quantity: 1, unit_cost: null, unit_price: 25 })

    await saveQuote(quoteId, { items: nextItems, notes: 'Edited draft' }, pricingConfig)

    const { quote, items } = await getQuoteWithItems(quoteId)
    expect(items).toHaveLength(5)
    expect(items.find((i) => i.type === 'part')).toBeUndefined()
    expect(items.find((i) => i.id === glassItem.id)?.quantity).toBe(2)
    expect(items.some((i) => i.description === 'Extra labor')).toBe(true)

    const recalced = recalculateStoredQuote(quote, items)
    expect(quote.subtotal).toBe(recalced.subtotal)
    expect(quote.tax).toBe(recalced.tax)
    expect(quote.total).toBe(recalced.total)
  })

  it('presents the quote, which moves the linked lead to quoted', async () => {
    const lead = await getLead(leadId)
    expect(lead.status).toBe('new')

    const presented = await updateQuoteStatus(quoteId, 'presented')
    expect(presented.status).toBe('presented')

    const updatedLead = await getLead(leadId)
    expect(updatedLead.status).toBe('quoted')
  })

  it('walks follow_up -> presented -> approved', async () => {
    const followUp = await updateQuoteStatus(quoteId, 'follow_up')
    expect(followUp.status).toBe('follow_up')

    const presentedAgain = await updateQuoteStatus(quoteId, 'presented')
    expect(presentedAgain.status).toBe('presented')

    const approved = await updateQuoteStatus(quoteId, 'approved')
    expect(approved.status).toBe('approved')
  })

  it('rejects saving items on an approved quote', async () => {
    await expect(
      saveQuote(quoteId, { items: [{ type: 'labor', description: 'x', quantity: 1, unit_cost: null, unit_price: 1 }], notes: null }, pricingConfig),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects a direct item insert against an approved quote (lock trigger)', async () => {
    const { error } = await supabase
      .from('quote_items')
      .insert({ quote_id: quoteId, type: 'labor', description: 'sneaky', quantity: 1, unit_price: 10 })
    expect(error).not.toBeNull()
  })

  it('rejects a direct totals edit on an approved quote (quote lock trigger)', async () => {
    const { error } = await supabase.from('quotes').update({ subtotal: 1, tax: 0, total: 1 }).eq('id', quoteId)
    expect(error).not.toBeNull()
  })

  it('creates a job from the approved quote', async () => {
    const job = await createJobFromQuote({ quote_id: quoteId, customer_id: customerA.id, vehicle_id: vehicleA.id })
    expect(job.quote_id).toBe(quoteId)
    expect(job.status).toBe('booked')
  })

  it('logs the full quote/item activity trail attributed to the signed-in user', async () => {
    const activity = await listActivityForEntity('quote', quoteId, 200)
    const actions = activity.map((a) => a.action)

    expect(actions).toContain('quote.created')
    expect(actions).toContain('quote.status_changed')
    expect(actions).toContain('quote.item_added')
    expect(actions).toContain('quote.item_updated')
    expect(actions).toContain('quote.item_removed')
    for (const row of activity) expect(row.actor_id).toBe(userId)
  })
})

describe('quote status edge cases', () => {
  let customer: Customer
  let vehicle: Vehicle
  let draftQuoteId: string

  beforeAll(async () => {
    customer = await createCustomer({ name: 'Edge Case Customer', phone: `(555) 300-${RUN}` })
    vehicle = await createVehicle({ customer_id: customer.id, year: 2018, make: 'Honda', model: 'Accord' })
    const quote = await createQuote({ customer_id: customer.id, vehicle_id: vehicle.id })
    draftQuoteId = quote.id
  })

  it('rejects draft -> approved, both client-side and at the DB', async () => {
    await expect(updateQuoteStatus(draftQuoteId, 'approved')).rejects.toBeInstanceOf(ValidationError)

    const { error } = await supabase.from('quotes').update({ status: 'approved' }).eq('id', draftQuoteId)
    expect(error).not.toBeNull()
  })

  it('rejects createJobFromQuote against a draft (non-approved) quote', async () => {
    await expect(
      createJobFromQuote({ quote_id: draftQuoteId, customer_id: customer.id, vehicle_id: vehicle.id }),
    ).rejects.toThrow()
  })

  it('rejects moving to lost without a reason', async () => {
    await expect(updateQuoteStatus(draftQuoteId, 'lost')).rejects.toBeInstanceOf(ValidationError)
  })

  it('moves lost -> draft and clears the lost reason', async () => {
    const lost = await updateQuoteStatus(draftQuoteId, 'lost', 'Customer went with a competitor')
    expect(lost.status).toBe('lost')
    expect(lost.lost_reason).toBe('Customer went with a competitor')

    const draft = await updateQuoteStatus(draftQuoteId, 'draft')
    expect(draft.status).toBe('draft')
    expect(draft.lost_reason).toBeNull()
  })

  it('rounds item numbers to stored precision so reloaded totals match exactly', async () => {
    const config = await getPricingConfig()
    await saveQuote(
      draftQuoteId,
      { items: [{ type: 'labor', description: 'Odd hours', quantity: 1.555, unit_cost: null, unit_price: 33.333 }], notes: null },
      config,
    )
    const { quote, items } = await getQuoteWithItems(draftQuoteId)
    expect(items[0].quantity).toBe(1.56)
    expect(items[0].unit_price).toBe(33.33)
    const recalculated = recalculateStoredQuote(quote, items)
    expect(recalculated.subtotal).toBe(quote.subtotal)
    expect(recalculated.tax).toBe(quote.tax)
    expect(recalculated.total).toBe(quote.total)
  })

  it('does not let a pricing rule value be rewritten in place', async () => {
    const rows = await listPricingRuleRows()
    const { error } = await supabase.from('pricing_rules').update({ value: { rate: 0, taxable_types: [] } }).eq('id', rows[0].id)
    expect(error).not.toBeNull()
  })

  it('rejects createJobFromQuote against a nonexistent quote id with a ValidationError on quote_id', async () => {
    const bogusId = crypto.randomUUID()
    try {
      await createJobFromQuote({ quote_id: bogusId, customer_id: customer.id, vehicle_id: vehicle.id })
      throw new Error('expected createJobFromQuote to reject')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).errors.quote_id).toBeTruthy()
    }
  })
})
