// Workstream B shared contract: Quote, QuoteItem, PricingRule and the pure
// calculator/pricing shapes. Keep in sync with
// supabase/migrations/20260921120000_quotes_pricing.sql.
//
// Money in these types is in dollars (number, 2dp). The calculator works in
// integer cents internally so results are deterministic.

import type { StatusOption } from '../shared/types.ts'

// ------------------------------------------------------------------
// Quote status
// ------------------------------------------------------------------

export type QuoteStatus = 'draft' | 'presented' | 'follow_up' | 'approved' | 'lost'

export const QUOTE_STATUSES: StatusOption<QuoteStatus>[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'presented', label: 'Presented' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'approved', label: 'Approved' },
  { value: 'lost', label: 'Lost' },
]

// Allowed transitions. Mirrored by the enforce_quote_status trigger in SQL.
export const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ['presented', 'lost'],
  presented: ['draft', 'follow_up', 'approved', 'lost'],
  follow_up: ['presented', 'approved', 'lost'],
  approved: [],
  lost: ['draft'],
}

// Items can only change while the quote is in one of these statuses.
export const EDITABLE_QUOTE_STATUSES: QuoteStatus[] = ['draft', 'presented', 'follow_up']

// ------------------------------------------------------------------
// Quote items
// ------------------------------------------------------------------

export type QuoteItemType = 'glass' | 'labor' | 'adas' | 'part' | 'discount'

export const QUOTE_ITEM_TYPES: StatusOption<QuoteItemType>[] = [
  { value: 'glass', label: 'Glass' },
  { value: 'labor', label: 'Labor' },
  { value: 'adas', label: 'ADAS calibration' },
  { value: 'part', label: 'Additional part' },
  { value: 'discount', label: 'Discount' },
]

// Item types a pricing rule can suggest a unit price for.
export type PricedItemType = Exclude<QuoteItemType, 'discount'>

export interface QuoteItemMetadata {
  // Discount lines only: when set, the discount amount is this percent (0-100)
  // of the gross (sum of non-discount lines) and unit_price is ignored.
  percent?: number
  // Pricing rule row id used to suggest unit_price, for transparency.
  pricing_rule_id?: string
  [key: string]: unknown
}

export interface QuoteItem {
  id: string
  quote_id: string
  type: QuoteItemType
  description: string
  quantity: number
  unit_cost: number | null
  // For discount lines: the positive amount to subtract (per unit).
  unit_price: number
  metadata: QuoteItemMetadata
  sort_order: number
}

// What the editor/calculator works with before the item is saved.
export interface QuoteItemInput {
  id?: string
  type: QuoteItemType
  description: string
  quantity: number
  unit_cost: number | null
  unit_price: number
  metadata?: QuoteItemMetadata
}

// ------------------------------------------------------------------
// Quote
// ------------------------------------------------------------------

export interface Quote {
  id: string
  lead_id: string | null
  customer_id: string
  vehicle_id: string
  status: QuoteStatus
  subtotal: number
  tax: number
  total: number
  notes: string | null
  lost_reason: string | null
  pricing_snapshot: PricingSnapshot
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface QuoteCreateInput {
  customer_id: string
  vehicle_id: string
  lead_id?: string | null
  notes?: string | null
}

// ------------------------------------------------------------------
// Pricing rules (table: pricing_rules)
// ------------------------------------------------------------------

export type PricingRuleKey = 'price.glass' | 'price.labor' | 'price.adas' | 'price.part' | 'tax' | 'discount'

export const PRICING_RULE_KEYS: PricingRuleKey[] = ['price.glass', 'price.labor', 'price.adas', 'price.part', 'tax', 'discount']

// price.* rules: how to suggest a unit price for an item type.
//   markup_percent: unit_price = unit_cost * (1 + value/100)   (needs unit_cost)
//   markup_amount:  unit_price = unit_cost + value              (needs unit_cost)
//   fixed:          unit_price = value                          (e.g. a labor rate)
export type PriceRuleValue =
  | { mode: 'markup_percent'; value: number }
  | { mode: 'markup_amount'; value: number }
  | { mode: 'fixed'; value: number }

// tax: rate is a fraction (0.0825 = 8.25%). Only lines whose type is in
// taxable_types count toward the taxable base. Including 'discount' means
// discounts reduce the taxable base.
export interface TaxRuleValue {
  rate: number
  taxable_types: QuoteItemType[]
}

// discount: max_percent caps total discount as a percent of gross; null = no cap.
export interface DiscountRuleValue {
  max_percent: number | null
}

export interface PricingRuleValueByKey {
  'price.glass': PriceRuleValue
  'price.labor': PriceRuleValue
  'price.adas': PriceRuleValue
  'price.part': PriceRuleValue
  tax: TaxRuleValue
  discount: DiscountRuleValue
}

// Raw DB row. value is untrusted jsonb until parsed by pricing.ts.
export interface PricingRuleRow {
  id: string
  key: string
  value: unknown
  active_from: string
  active_to: string | null
  updated_by: string | null
}

export interface ResolvedRule<K extends PricingRuleKey> {
  id: string
  key: K
  value: PricingRuleValueByKey[K]
}

// The active rule for each key, or null when not configured. Unknown keys and
// invalid values are dropped and reported in `issues`.
export interface PricingConfig {
  rules: { [K in PricingRuleKey]: ResolvedRule<K> | null }
  issues: string[]
}

// Stored on quotes.pricing_snapshot at save time so a reloaded quote
// recalculates to exactly the saved totals.
export interface PricingSnapshot {
  rules?: Partial<{ [K in PricingRuleKey]: ResolvedRule<K> | null }>
  captured_at?: string
}

// ------------------------------------------------------------------
// Calculator output
// ------------------------------------------------------------------

export interface CalculatedLine {
  index: number
  type: QuoteItemType
  description: string
  quantity: number
  unit_price: number
  // Signed: discount lines are negative.
  line_total: number
  taxable: boolean
  // Human-readable explanation, e.g. "2 × $95.00" or "10% of $500.00 gross".
  explanation: string
}

export type CalculationIssueCode =
  | 'tax_not_configured'
  | 'discount_exceeds_max'
  | 'discount_exceeds_gross'
  | 'invalid_quantity'
  | 'invalid_price'
  | 'no_items'

export interface CalculationIssue {
  code: CalculationIssueCode
  message: string
  // Line index when the issue is about one line.
  index?: number
  // Blocking issues prevent presenting/approving the quote.
  blocking: boolean
}

export interface QuoteCalculation {
  lines: CalculatedLine[]
  gross: number // sum of non-discount lines
  discount_total: number // positive amount subtracted
  subtotal: number // gross - discount_total (pre-tax)
  taxable_base: number
  tax_rate: number | null // null when tax not configured
  tax: number
  total: number // subtotal + tax
  issues: CalculationIssue[]
}
