import { supabase } from '../lib/supabase.ts'
import { resolvePricingRules, parsePricingRuleValue } from '../quote/pricing.ts'
import type { PricingConfig, PricingRuleRow } from '../quote/types.ts'
import { ValidationError } from './errors.ts'
import { unwrap } from './unwrap.ts'

export async function listPricingRuleRows(): Promise<PricingRuleRow[]> {
  return unwrap(await supabase.from('pricing_rules').select('*'))
}

export async function getPricingConfig(now: Date = new Date()): Promise<PricingConfig> {
  const rows = await listPricingRuleRows()
  return resolvePricingRules(rows, now)
}

export async function setPricingRule(key: string, value: unknown): Promise<PricingRuleRow> {
  const parsed = parsePricingRuleValue(key, value)
  if (!parsed.ok) throw new ValidationError({ value: parsed.error })

  // set_pricing_rule returns a single pricing_rules row (not a set), so
  // PostgREST already hands back one object — no .single() needed.
  return unwrap(await supabase.rpc('set_pricing_rule', { p_key: parsed.key, p_value: parsed.value }))
}
