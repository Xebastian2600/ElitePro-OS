import { supabase } from '../lib/supabase.ts'
import type { CustomerRef, VehicleRef } from '../shared/types.ts'
import { calculateQuote } from '../quote/calculator.ts'
import { configToSnapshot, snapshotToConfig } from '../quote/pricing.ts'
import { validateQuoteTransition } from '../quote/status.ts'
import { EDITABLE_QUOTE_STATUSES } from '../quote/types.ts'
import type {
  CalculationIssue,
  PricingConfig,
  Quote,
  QuoteCalculation,
  QuoteCreateInput,
  QuoteItem,
  QuoteItemInput,
  QuoteStatus,
} from '../quote/types.ts'
import { getLead, updateLeadStatus } from './leads.ts'
import { ValidationError } from './errors.ts'
import { unwrap } from './unwrap.ts'

export const QUOTE_WITH_REFS_SELECT = '*, customer:customers(id,name,phone,email), vehicle:vehicles(id,year,make,model,vin)'

export type QuoteWithRefs = Quote & { customer: CustomerRef | null; vehicle: VehicleRef | null }

// PostgREST may return numeric(12,2) columns as strings; normalize to the plain-number
// shape the shared contract (src/quote/types.ts) expects.
function toQuote(row: Record<string, unknown>): Quote {
  return {
    id: row.id as string,
    lead_id: (row.lead_id as string | null) ?? null,
    customer_id: row.customer_id as string,
    vehicle_id: row.vehicle_id as string,
    status: row.status as QuoteStatus,
    subtotal: Number(row.subtotal),
    tax: Number(row.tax),
    total: Number(row.total),
    notes: (row.notes as string | null) ?? null,
    lost_reason: (row.lost_reason as string | null) ?? null,
    pricing_snapshot: (row.pricing_snapshot as Quote['pricing_snapshot']) ?? {},
    created_by: (row.created_by as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

function toQuoteWithRefs(row: Record<string, unknown>): QuoteWithRefs {
  return {
    ...toQuote(row),
    customer: (row.customer as CustomerRef | null) ?? null,
    vehicle: (row.vehicle as VehicleRef | null) ?? null,
  }
}

function toQuoteItem(row: Record<string, unknown>): QuoteItem {
  return {
    id: row.id as string,
    quote_id: row.quote_id as string,
    type: row.type as QuoteItem['type'],
    description: row.description as string,
    quantity: Number(row.quantity),
    unit_cost: row.unit_cost == null ? null : Number(row.unit_cost),
    unit_price: Number(row.unit_price),
    metadata: (row.metadata as QuoteItem['metadata']) ?? {},
    sort_order: Number(row.sort_order),
  }
}

function toQuoteItemInput(item: QuoteItem): QuoteItemInput {
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

export async function listQuotes(
  options: { status?: QuoteStatus; leadId?: string; customerId?: string } = {},
): Promise<QuoteWithRefs[]> {
  let query = supabase.from('quotes').select(QUOTE_WITH_REFS_SELECT).order('updated_at', { ascending: false })
  if (options.status) query = query.eq('status', options.status)
  if (options.leadId) query = query.eq('lead_id', options.leadId)
  if (options.customerId) query = query.eq('customer_id', options.customerId)
  const rows = unwrap(await query)
  return (rows as unknown as Record<string, unknown>[]).map(toQuoteWithRefs)
}

export async function getQuote(id: string): Promise<QuoteWithRefs> {
  const row = unwrap(await supabase.from('quotes').select(QUOTE_WITH_REFS_SELECT).eq('id', id).single())
  return toQuoteWithRefs(row as unknown as Record<string, unknown>)
}

export async function listQuoteItems(quoteId: string): Promise<QuoteItem[]> {
  const rows = unwrap(
    await supabase.from('quote_items').select('*').eq('quote_id', quoteId).order('sort_order', { ascending: true }),
  )
  return (rows as unknown as Record<string, unknown>[]).map(toQuoteItem)
}

export async function getQuoteWithItems(id: string): Promise<{ quote: QuoteWithRefs; items: QuoteItem[] }> {
  const [quote, items] = await Promise.all([getQuote(id), listQuoteItems(id)])
  return { quote, items }
}

export async function createQuote(input: QuoteCreateInput): Promise<Quote> {
  const errors: Record<string, string> = {}
  const customer_id = (input.customer_id ?? '').trim()
  const vehicle_id = (input.vehicle_id ?? '').trim()
  if (!customer_id) errors.customer_id = 'Customer is required.'
  if (!vehicle_id) errors.vehicle_id = 'Vehicle is required.'
  if (Object.keys(errors).length > 0) throw new ValidationError(errors)

  const row = unwrap(
    await supabase
      .from('quotes')
      .insert({
        customer_id,
        vehicle_id,
        lead_id: input.lead_id ?? null,
        notes: input.notes ?? null,
      })
      .select('*')
      .single(),
  )
  return toQuote(row as unknown as Record<string, unknown>)
}

// Maps a blocking issue to a form field key, e.g. "items.2.quantity". Issues without
// an index (e.g. discount_exceeds_gross) are keyed under "_".
function issueField(issue: CalculationIssue): string {
  if (issue.code === 'invalid_quantity') return 'quantity'
  if (issue.code === 'invalid_price') {
    if (/unit cost/i.test(issue.message)) return 'unit_cost'
    if (/percent/i.test(issue.message)) return 'metadata.percent'
    return 'unit_price'
  }
  return 'value'
}

function issueKey(issue: CalculationIssue): string {
  return issue.index !== undefined ? `items.${issue.index}.${issueField(issue)}` : '_'
}

// Malformed-line codes block saveQuote itself; the rest (tax_not_configured, no_items,
// discount_exceeds_max) only block status transitions — a draft can be saved half-finished.
const SAVE_BLOCKING_CODES = new Set(['invalid_quantity', 'invalid_price', 'discount_exceeds_gross'])

interface ItemFields {
  type: QuoteItem['type']
  description: string
  quantity: number
  unit_cost: number | null
  unit_price: number
  metadata: QuoteItem['metadata']
  sort_order: number
}

function itemPatch(current: QuoteItem, next: ItemFields): Partial<ItemFields> | null {
  const patch: Partial<ItemFields> = {}
  if (current.type !== next.type) patch.type = next.type
  if (current.description !== next.description) patch.description = next.description
  if (current.quantity !== next.quantity) patch.quantity = next.quantity
  if (current.unit_cost !== next.unit_cost) patch.unit_cost = next.unit_cost
  if (current.unit_price !== next.unit_price) patch.unit_price = next.unit_price
  if (JSON.stringify(current.metadata) !== JSON.stringify(next.metadata)) patch.metadata = next.metadata
  if (current.sort_order !== next.sort_order) patch.sort_order = next.sort_order
  return Object.keys(patch).length > 0 ? patch : null
}

// NOT atomic: items are written across several requests (delete -> update -> insert),
// then totals last, so a mid-save failure leaves items recomputable via recalculateStoredQuote().
export async function saveQuote(
  id: string,
  input: { items: QuoteItemInput[]; notes?: string | null },
  config: PricingConfig,
): Promise<{ quote: Quote; items: QuoteItem[] }> {
  const current = await getQuote(id)
  if (!EDITABLE_QUOTE_STATUSES.includes(current.status)) {
    throw new ValidationError({ status: `Items cannot be edited while the quote is ${current.status}.` })
  }

  // Round to the DB's numeric(…,2) precision first, so the totals we store are
  // exactly what recalculateStoredQuote() gets back after a reload.
  const round2 = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : n)
  input = {
    ...input,
    items: input.items.map((item) => ({
      ...item,
      quantity: round2(item.quantity),
      unit_price: round2(item.unit_price),
      unit_cost: item.unit_cost === null ? null : round2(item.unit_cost),
    })),
  }

  const calc: QuoteCalculation = calculateQuote(input.items, config)
  const blocking = calc.issues.filter((issue) => SAVE_BLOCKING_CODES.has(issue.code))
  if (blocking.length > 0) {
    const errors: Record<string, string> = {}
    for (const issue of blocking) errors[issueKey(issue)] = issue.message
    throw new ValidationError(errors)
  }

  const currentItems = await listQuoteItems(id)
  const currentById = new Map(currentItems.map((item) => [item.id, item]))
  const incomingIds = new Set(input.items.filter((item) => item.id).map((item) => item.id as string))

  const toDeleteIds = currentItems.filter((item) => !incomingIds.has(item.id)).map((item) => item.id)

  const toInsert: (ItemFields & { quote_id: string })[] = []
  const toUpdate: { id: string; patch: Partial<ItemFields> }[] = []

  input.items.forEach((item, index) => {
    const fields: ItemFields = {
      type: item.type,
      description: item.description,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      unit_price: item.unit_price,
      metadata: item.metadata ?? {},
      sort_order: index,
    }

    if (!item.id) {
      toInsert.push({ ...fields, quote_id: id })
      return
    }

    const existing = currentById.get(item.id)
    if (!existing) {
      throw new ValidationError({ [`items.${index}.id`]: 'This item no longer exists on the quote.' })
    }
    const patch = itemPatch(existing, fields)
    if (patch) toUpdate.push({ id: item.id, patch })
  })

  // delete -> update -> insert, totals last (see saveQuote's atomicity note above)
  if (toDeleteIds.length > 0) {
    unwrap(await supabase.from('quote_items').delete().in('id', toDeleteIds).select('id'))
  }
  for (const { id: itemId, patch } of toUpdate) {
    unwrap(await supabase.from('quote_items').update(patch).eq('id', itemId).select('id').single())
  }
  if (toInsert.length > 0) {
    unwrap(await supabase.from('quote_items').insert(toInsert).select('id'))
  }

  const quoteRow = unwrap(
    await supabase
      .from('quotes')
      .update({
        subtotal: calc.subtotal,
        tax: calc.tax,
        total: calc.total,
        notes: input.notes ?? null,
        pricing_snapshot: configToSnapshot(config, new Date()),
      })
      .eq('id', id)
      .select('*')
      .single(),
  )

  const finalItems = await listQuoteItems(id)
  return { quote: toQuote(quoteRow as unknown as Record<string, unknown>), items: finalItems }
}

export function recalculateStoredQuote(quote: Quote, items: QuoteItem[]): QuoteCalculation {
  const config = snapshotToConfig(quote.pricing_snapshot)
  return calculateQuote(items.map(toQuoteItemInput), config)
}

export async function updateQuoteStatus(id: string, to: QuoteStatus, lost_reason?: string | null): Promise<Quote> {
  const quote = await getQuote(id)
  const items = await listQuoteItems(id)
  const calculation = recalculateStoredQuote(quote, items)

  const result = validateQuoteTransition({ from: quote.status, to, lost_reason, calculation })
  if (!result.ok) throw new ValidationError({ status: result.error })

  const patch: { status: QuoteStatus; lost_reason?: string | null } = { status: to }
  if (to === 'lost') patch.lost_reason = lost_reason ?? null

  const row = unwrap(await supabase.from('quotes').update(patch).eq('id', id).select('*').single())
  const updated = toQuote(row as unknown as Record<string, unknown>)

  if (to === 'presented' && quote.lead_id) {
    const lead = await getLead(quote.lead_id)
    if (lead.status === 'new' || lead.status === 'contacted' || lead.status === 'qualified') {
      await updateLeadStatus(quote.lead_id, 'quoted')
    }
  }

  return updated
}
