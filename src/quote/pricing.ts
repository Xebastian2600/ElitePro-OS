// Pure pricing-rule parsing/resolution. No Supabase import, no hard-coded
// company pricing — every number here comes from a PricingRuleRow.

import type {
  DiscountRuleValue,
  PriceRuleValue,
  PricingConfig,
  PricingRuleKey,
  PricingRuleRow,
  PricingRuleValueByKey,
  PricingSnapshot,
  QuoteItemType,
  ResolvedRule,
  TaxRuleValue,
} from './types.ts'
import { PRICING_RULE_KEYS, QUOTE_ITEM_TYPES } from './types.ts'

const ITEM_TYPE_VALUES: QuoteItemType[] = QUOTE_ITEM_TYPES.map((t) => t.value)

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type ParsePricingRuleResult =
  | { ok: true; key: PricingRuleKey; value: PricingRuleValueByKey[PricingRuleKey] }
  | { ok: false; error: string }

const PRICE_KEY_LABELS: Record<PricingRuleKey, string> = {
  'price.glass': 'Glass',
  'price.labor': 'Labor',
  'price.adas': 'ADAS calibration',
  'price.part': 'Additional part',
  tax: 'Tax',
  discount: 'Discount',
}

function parsePriceRuleValue(key: PricingRuleKey, value: unknown): ParsePricingRuleResult {
  if (!isPlainObject(value)) {
    return { ok: false, error: `${key}: value must be an object.` }
  }
  const mode = value.mode
  if (mode !== 'markup_percent' && mode !== 'markup_amount' && mode !== 'fixed') {
    return { ok: false, error: `${key}: mode must be one of markup_percent, markup_amount, fixed.` }
  }
  const amount = value.value
  if (!isFiniteNumber(amount) || amount < 0) {
    return { ok: false, error: `${key}: value.value must be a finite number >= 0.` }
  }
  const parsed: PriceRuleValue = { mode, value: amount }
  return { ok: true, key, value: parsed }
}

function parseTaxRuleValue(value: unknown): ParsePricingRuleResult {
  if (!isPlainObject(value)) {
    return { ok: false, error: 'tax: value must be an object.' }
  }
  const rate = value.rate
  if (!isFiniteNumber(rate) || rate < 0 || rate >= 1) {
    return { ok: false, error: 'tax: rate must be a finite number in [0, 1).' }
  }
  const taxableTypes = value.taxable_types
  if (!Array.isArray(taxableTypes)) {
    return { ok: false, error: 'tax: taxable_types must be an array.' }
  }
  const seen = new Set<string>()
  for (const t of taxableTypes) {
    if (typeof t !== 'string' || !ITEM_TYPE_VALUES.includes(t as QuoteItemType)) {
      return { ok: false, error: `tax: taxable_types contains an invalid item type "${String(t)}".` }
    }
    if (seen.has(t)) {
      return { ok: false, error: `tax: taxable_types contains a duplicate "${t}".` }
    }
    seen.add(t)
  }
  const parsed: TaxRuleValue = { rate, taxable_types: taxableTypes as QuoteItemType[] }
  return { ok: true, key: 'tax', value: parsed }
}

function parseDiscountRuleValue(value: unknown): ParsePricingRuleResult {
  if (!isPlainObject(value)) {
    return { ok: false, error: 'discount: value must be an object.' }
  }
  const maxPercent = value.max_percent
  if (maxPercent !== null && (!isFiniteNumber(maxPercent) || maxPercent < 0 || maxPercent > 100)) {
    return { ok: false, error: 'discount: max_percent must be null or a finite number in [0, 100].' }
  }
  const parsed: DiscountRuleValue = { max_percent: maxPercent }
  return { ok: true, key: 'discount', value: parsed }
}

export function parsePricingRuleValue(key: string, value: unknown): ParsePricingRuleResult {
  if (key === 'price.glass' || key === 'price.labor' || key === 'price.adas' || key === 'price.part') {
    return parsePriceRuleValue(key, value)
  }
  if (key === 'tax') return parseTaxRuleValue(value)
  if (key === 'discount') return parseDiscountRuleValue(value)
  return { ok: false, error: `Unknown pricing rule key "${key}".` }
}

export function emptyPricingConfig(): PricingConfig {
  return {
    rules: {
      'price.glass': null,
      'price.labor': null,
      'price.adas': null,
      'price.part': null,
      tax: null,
      discount: null,
    },
    issues: [],
  }
}

function isRowActive(row: PricingRuleRow, now: Date): boolean {
  const activeFrom = new Date(row.active_from)
  if (Number.isNaN(activeFrom.getTime()) || activeFrom.getTime() > now.getTime()) return false
  if (row.active_to != null) {
    const activeTo = new Date(row.active_to)
    if (!Number.isNaN(activeTo.getTime()) && activeTo.getTime() <= now.getTime()) return false
  }
  return true
}

function pickActiveRow(candidates: PricingRuleRow[], now: Date): PricingRuleRow | null {
  let best: PricingRuleRow | null = null
  for (const row of candidates) {
    if (!isRowActive(row, now)) continue
    if (best === null || new Date(row.active_from).getTime() > new Date(best.active_from).getTime()) {
      best = row
    }
  }
  return best
}

export function resolvePricingRules(rows: PricingRuleRow[], now: Date): PricingConfig {
  const config = emptyPricingConfig()
  const knownKeys = new Set<string>(PRICING_RULE_KEYS)

  for (const key of PRICING_RULE_KEYS) {
    const best = pickActiveRow(
      rows.filter((row) => row.key === key),
      now,
    )
    if (best === null) continue

    const parsed = parsePricingRuleValue(key, best.value)
    if (!parsed.ok) {
      config.issues.push(parsed.error)
      continue
    }

    ;(config.rules as Record<PricingRuleKey, ResolvedRule<PricingRuleKey> | null>)[key] = {
      id: best.id,
      key: parsed.key,
      value: parsed.value,
    }
  }

  // Rows whose key isn't a recognized PricingRuleKey at all can't resolve
  // into any config slot, but an active one is still a real misconfiguration
  // worth surfacing.
  const unknownKeys = new Set(rows.filter((row) => !knownKeys.has(row.key)).map((row) => row.key))
  for (const unknownKey of unknownKeys) {
    const best = pickActiveRow(
      rows.filter((row) => row.key === unknownKey),
      now,
    )
    if (best === null) continue
    const parsed = parsePricingRuleValue(unknownKey, best.value)
    if (!parsed.ok) config.issues.push(parsed.error)
  }

  return config
}

export function configToSnapshot(config: PricingConfig, now: Date): PricingSnapshot {
  const rules: Record<PricingRuleKey, ResolvedRule<PricingRuleKey> | null> = {} as Record<
    PricingRuleKey,
    ResolvedRule<PricingRuleKey> | null
  >
  for (const key of PRICING_RULE_KEYS) {
    rules[key] = config.rules[key]
  }
  return { rules: rules as PricingSnapshot['rules'], captured_at: now.toISOString() }
}

export function snapshotToConfig(snapshot: PricingSnapshot): PricingConfig {
  const config = emptyPricingConfig()
  const rules = config.rules as Record<PricingRuleKey, ResolvedRule<PricingRuleKey> | null>
  for (const key of PRICING_RULE_KEYS) {
    rules[key] = snapshot.rules?.[key] ?? null
  }
  return config
}

export type SuggestUnitPriceResult =
  | { unit_price: number; rule_id: string; explanation: string }
  | { unit_price: null; reason: string }

function roundCentsToDollars(cents: number): number {
  return Math.round(cents) / 100
}

export function suggestUnitPrice(
  type: QuoteItemType,
  unit_cost: number | null,
  config: PricingConfig,
): SuggestUnitPriceResult {
  if (type === 'discount') {
    return { unit_price: null, reason: 'Discount lines do not use a suggested price.' }
  }

  const key: PricingRuleKey = `price.${type}` as PricingRuleKey
  const resolved = config.rules[key]
  if (resolved === null) {
    return { unit_price: null, reason: `No pricing rule configured for ${PRICE_KEY_LABELS[key]}.` }
  }

  const rule = resolved.value as PriceRuleValue

  if (rule.mode === 'fixed') {
    const cents = Math.round(rule.value * 100)
    return {
      unit_price: roundCentsToDollars(cents),
      rule_id: resolved.id,
      explanation: describeRule(resolved),
    }
  }

  if (unit_cost === null || !Number.isFinite(unit_cost)) {
    return { unit_price: null, reason: `${PRICE_KEY_LABELS[key]} pricing needs a unit cost.` }
  }

  const costCents = Math.round(unit_cost * 100)
  let priceCents: number
  if (rule.mode === 'markup_percent') {
    priceCents = Math.round(costCents * (1 + rule.value / 100))
  } else {
    priceCents = Math.round(costCents + rule.value * 100)
  }

  return {
    unit_price: roundCentsToDollars(priceCents),
    rule_id: resolved.id,
    explanation: describeRule(resolved),
  }
}

export function ruleLabel(key: PricingRuleKey): string {
  return PRICE_KEY_LABELS[key]
}

export function describeRule(resolved: ResolvedRule<PricingRuleKey>): string {
  const { key, value } = resolved
  if (key === 'tax') {
    const tax = value as TaxRuleValue
    const pct = (tax.rate * 100).toFixed(2).replace(/\.?0+$/, '')
    if (tax.taxable_types.length === 0) return `Tax ${pct}% on no item types`
    const labels = tax.taxable_types.map((t) => QUOTE_ITEM_TYPES.find((o) => o.value === t)?.label ?? t)
    return `Tax ${pct}% on ${labels.join(', ')}`
  }
  if (key === 'discount') {
    const discount = value as DiscountRuleValue
    return discount.max_percent === null ? 'No discount cap' : `Max discount ${trimNumber(discount.max_percent)}%`
  }
  const rule = value as PriceRuleValue
  if (rule.mode === 'markup_percent') return `Markup ${trimNumber(rule.value)}% on cost`
  if (rule.mode === 'markup_amount') return `Markup $${rule.value.toFixed(2)} on cost`
  return `Fixed $${rule.value.toFixed(2)}`
}

function trimNumber(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, '')
}
