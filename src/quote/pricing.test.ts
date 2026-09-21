import { describe, expect, it } from 'vitest'
import {
  configToSnapshot,
  describeRule,
  emptyPricingConfig,
  parsePricingRuleValue,
  resolvePricingRules,
  ruleLabel,
  snapshotToConfig,
  suggestUnitPrice,
} from './pricing.ts'
import type { PricingRuleRow } from './types.ts'

function row(overrides: Partial<PricingRuleRow>): PricingRuleRow {
  return {
    id: 'row-1',
    key: 'price.glass',
    value: { mode: 'fixed', value: 100 },
    active_from: '2020-01-01T00:00:00Z',
    active_to: null,
    updated_by: null,
    ...overrides,
  }
}

describe('parsePricingRuleValue', () => {
  it('accepts valid price.* rules for every mode', () => {
    expect(parsePricingRuleValue('price.glass', { mode: 'markup_percent', value: 35 })).toEqual({
      ok: true,
      key: 'price.glass',
      value: { mode: 'markup_percent', value: 35 },
    })
    expect(parsePricingRuleValue('price.labor', { mode: 'markup_amount', value: 10 })).toEqual({
      ok: true,
      key: 'price.labor',
      value: { mode: 'markup_amount', value: 10 },
    })
    expect(parsePricingRuleValue('price.adas', { mode: 'fixed', value: 199.99 })).toEqual({
      ok: true,
      key: 'price.adas',
      value: { mode: 'fixed', value: 199.99 },
    })
    expect(parsePricingRuleValue('price.part', { mode: 'fixed', value: 0 })).toEqual({
      ok: true,
      key: 'price.part',
      value: { mode: 'fixed', value: 0 },
    })
  })

  it('rejects price.* rules with a bad mode', () => {
    const result = parsePricingRuleValue('price.glass', { mode: 'bogus', value: 10 })
    expect(result.ok).toBe(false)
  })

  it('rejects price.* rules with a non-finite or negative value', () => {
    expect(parsePricingRuleValue('price.glass', { mode: 'fixed', value: -1 }).ok).toBe(false)
    expect(parsePricingRuleValue('price.glass', { mode: 'fixed', value: NaN }).ok).toBe(false)
    expect(parsePricingRuleValue('price.glass', { mode: 'fixed', value: Infinity }).ok).toBe(false)
    expect(parsePricingRuleValue('price.glass', { mode: 'fixed' }).ok).toBe(false)
    expect(parsePricingRuleValue('price.glass', null).ok).toBe(false)
  })

  it('accepts a valid tax rule with valid taxable types', () => {
    const result = parsePricingRuleValue('tax', { rate: 0.0825, taxable_types: ['glass', 'part'] })
    expect(result).toEqual({ ok: true, key: 'tax', value: { rate: 0.0825, taxable_types: ['glass', 'part'] } })
  })

  it('accepts an empty taxable_types array', () => {
    const result = parsePricingRuleValue('tax', { rate: 0.05, taxable_types: [] })
    expect(result.ok).toBe(true)
  })

  it('rejects a tax rule with rate outside [0, 1)', () => {
    expect(parsePricingRuleValue('tax', { rate: -0.01, taxable_types: [] }).ok).toBe(false)
    expect(parsePricingRuleValue('tax', { rate: 1, taxable_types: [] }).ok).toBe(false)
    expect(parsePricingRuleValue('tax', { rate: NaN, taxable_types: [] }).ok).toBe(false)
  })

  it('rejects a tax rule with an invalid or duplicate taxable type', () => {
    expect(parsePricingRuleValue('tax', { rate: 0.05, taxable_types: ['glass', 'bogus'] }).ok).toBe(false)
    expect(parsePricingRuleValue('tax', { rate: 0.05, taxable_types: ['glass', 'glass'] }).ok).toBe(false)
    expect(parsePricingRuleValue('tax', { rate: 0.05, taxable_types: 'glass' }).ok).toBe(false)
  })

  it('accepts a valid discount rule, including null max_percent', () => {
    expect(parsePricingRuleValue('discount', { max_percent: 10 })).toEqual({
      ok: true,
      key: 'discount',
      value: { max_percent: 10 },
    })
    expect(parsePricingRuleValue('discount', { max_percent: null })).toEqual({
      ok: true,
      key: 'discount',
      value: { max_percent: null },
    })
  })

  it('rejects a discount rule with max_percent outside [0, 100]', () => {
    expect(parsePricingRuleValue('discount', { max_percent: -1 }).ok).toBe(false)
    expect(parsePricingRuleValue('discount', { max_percent: 101 }).ok).toBe(false)
    expect(parsePricingRuleValue('discount', { max_percent: NaN }).ok).toBe(false)
  })

  it('rejects an unknown key', () => {
    const result = parsePricingRuleValue('price.tint', { mode: 'fixed', value: 1 })
    expect(result.ok).toBe(false)
  })
})

describe('resolvePricingRules', () => {
  const now = new Date('2026-06-01T00:00:00Z')

  it('picks the row active at now', () => {
    const rows: PricingRuleRow[] = [
      row({ id: 'a', active_from: '2026-01-01T00:00:00Z', active_to: null }),
    ]
    const config = resolvePricingRules(rows, now)
    expect(config.rules['price.glass']?.id).toBe('a')
    expect(config.issues).toEqual([])
  })

  it('picks the row with the latest active_from among multiple active candidates', () => {
    const rows: PricingRuleRow[] = [
      row({ id: 'old', active_from: '2025-01-01T00:00:00Z', active_to: null }),
      row({ id: 'new', active_from: '2026-01-01T00:00:00Z', active_to: null }),
    ]
    const config = resolvePricingRules(rows, now)
    expect(config.rules['price.glass']?.id).toBe('new')
  })

  it('ignores expired rows', () => {
    const rows: PricingRuleRow[] = [
      row({ id: 'expired', active_from: '2020-01-01T00:00:00Z', active_to: '2021-01-01T00:00:00Z' }),
    ]
    const config = resolvePricingRules(rows, now)
    expect(config.rules['price.glass']).toBeNull()
  })

  it('ignores future rows', () => {
    const rows: PricingRuleRow[] = [row({ id: 'future', active_from: '2027-01-01T00:00:00Z', active_to: null })]
    const config = resolvePricingRules(rows, now)
    expect(config.rules['price.glass']).toBeNull()
  })

  it('treats active_to as exclusive', () => {
    const rows: PricingRuleRow[] = [row({ id: 'boundary', active_from: '2026-01-01T00:00:00Z', active_to: now.toISOString() })]
    const config = resolvePricingRules(rows, now)
    expect(config.rules['price.glass']).toBeNull()
  })

  it('reports invalid rows as issues and resolves that key to null, without falling back to an older valid row', () => {
    const rows: PricingRuleRow[] = [
      row({ id: 'old-valid', key: 'tax', value: { rate: 0.05, taxable_types: [] }, active_from: '2020-01-01T00:00:00Z' }),
      row({ id: 'new-invalid', key: 'tax', value: { rate: 2, taxable_types: [] }, active_from: '2026-01-01T00:00:00Z' }),
    ]
    const config = resolvePricingRules(rows, now)
    expect(config.rules.tax).toBeNull()
    expect(config.issues.length).toBe(1)
    expect(config.issues[0]).toContain('tax')
  })

  it('reports unknown keys as issues', () => {
    const rows: PricingRuleRow[] = [row({ id: 'x', key: 'price.tint', active_from: '2020-01-01T00:00:00Z' })]
    const config = resolvePricingRules(rows, now)
    expect(config.issues.length).toBe(1)
  })

  it('every PRICING_RULE_KEYS entry is present in rules, null when unconfigured', () => {
    const config = resolvePricingRules([], now)
    expect(config.rules).toEqual({
      'price.glass': null,
      'price.labor': null,
      'price.adas': null,
      'price.part': null,
      tax: null,
      discount: null,
    })
  })
})

describe('emptyPricingConfig', () => {
  it('returns all-null rules and no issues', () => {
    const config = emptyPricingConfig()
    expect(config.issues).toEqual([])
    expect(config.rules['price.glass']).toBeNull()
    expect(config.rules.tax).toBeNull()
    expect(config.rules.discount).toBeNull()
  })
})

describe('configToSnapshot / snapshotToConfig', () => {
  it('round-trips a resolved config', () => {
    const now = new Date('2026-06-01T00:00:00Z')
    const rows: PricingRuleRow[] = [
      row({ id: 'glass-1', key: 'price.glass', value: { mode: 'fixed', value: 250 }, active_from: '2026-01-01T00:00:00Z' }),
      row({ id: 'tax-1', key: 'tax', value: { rate: 0.0825, taxable_types: ['glass'] }, active_from: '2026-01-01T00:00:00Z' }),
    ]
    const config = resolvePricingRules(rows, now)
    const snapshot = configToSnapshot(config, now)
    expect(snapshot.captured_at).toBe(now.toISOString())
    const restored = snapshotToConfig(snapshot)
    expect(restored.rules).toEqual(config.rules)
  })

  it('round-trips an empty config, missing keys resolving to null', () => {
    const snapshot = configToSnapshot(emptyPricingConfig(), new Date('2026-01-01T00:00:00Z'))
    const restored = snapshotToConfig(snapshot)
    expect(restored.rules['price.glass']).toBeNull()
    expect(restored.rules.tax).toBeNull()
  })

  it('snapshotToConfig handles a snapshot with missing keys entirely', () => {
    const restored = snapshotToConfig({ captured_at: '2026-01-01T00:00:00Z' })
    expect(restored.rules['price.glass']).toBeNull()
    expect(restored.rules.discount).toBeNull()
  })
})

describe('suggestUnitPrice', () => {
  const now = new Date('2026-06-01T00:00:00Z')

  function configWith(key: string, value: unknown): ReturnType<typeof resolvePricingRules> {
    return resolvePricingRules([row({ id: 'r1', key, value, active_from: '2026-01-01T00:00:00Z' })], now)
  }

  it('suggests a fixed price regardless of cost', () => {
    const config = configWith('price.labor', { mode: 'fixed', value: 95 })
    const result = suggestUnitPrice('labor', null, config)
    expect(result).toMatchObject({ unit_price: 95, rule_id: 'r1' })
  })

  it('suggests markup_percent price from cost', () => {
    const config = configWith('price.glass', { mode: 'markup_percent', value: 35 })
    const result = suggestUnitPrice('glass', 100, config)
    expect(result).toMatchObject({ unit_price: 135, rule_id: 'r1' })
  })

  it('suggests markup_amount price from cost', () => {
    const config = configWith('price.part', { mode: 'markup_amount', value: 15 })
    const result = suggestUnitPrice('part', 20, config)
    expect(result).toMatchObject({ unit_price: 35, rule_id: 'r1' })
  })

  it('returns null with a reason when unit_cost is null and mode needs cost', () => {
    const config = configWith('price.glass', { mode: 'markup_percent', value: 35 })
    const result = suggestUnitPrice('glass', null, config)
    expect(result.unit_price).toBeNull()
    if (result.unit_price === null) expect(result.reason).toBeTruthy()
  })

  it('returns null with a reason for discount type', () => {
    const config = emptyPricingConfig()
    const result = suggestUnitPrice('discount', null, config)
    expect(result.unit_price).toBeNull()
  })

  it('returns null with a reason when no rule is configured', () => {
    const config = emptyPricingConfig()
    const result = suggestUnitPrice('adas', 50, config)
    expect(result.unit_price).toBeNull()
    if (result.unit_price === null) expect(result.reason).toContain('ADAS calibration')
  })

  it('rounds to cents (33.335 cost with 10% markup)', () => {
    const config = configWith('price.part', { mode: 'markup_percent', value: 10 })
    const result = suggestUnitPrice('part', 33.335, config)
    // 33.335 -> 3333.5 cents rounds to 3334 (unit_cost cents rounding), *1.10 = 3667.4 -> 3667 cents = 36.67
    expect(result.unit_price).toBeCloseTo(36.67, 2)
  })

  it('rounds fixed price to cents', () => {
    const config = configWith('price.labor', { mode: 'fixed', value: 19.999 })
    const result = suggestUnitPrice('labor', null, config)
    expect(result.unit_price).toBe(20)
  })
})

describe('ruleLabel / describeRule', () => {
  it('labels every pricing rule key', () => {
    expect(ruleLabel('price.glass')).toBe('Glass')
    expect(ruleLabel('price.labor')).toBe('Labor')
    expect(ruleLabel('price.adas')).toBe('ADAS calibration')
    expect(ruleLabel('price.part')).toBe('Additional part')
    expect(ruleLabel('tax')).toBe('Tax')
    expect(ruleLabel('discount')).toBe('Discount')
  })

  it('describes markup_percent, markup_amount and fixed price rules', () => {
    expect(describeRule({ id: 'x', key: 'price.glass', value: { mode: 'markup_percent', value: 35 } })).toBe(
      'Markup 35% on cost',
    )
    expect(describeRule({ id: 'x', key: 'price.part', value: { mode: 'markup_amount', value: 15 } })).toBe(
      'Markup $15.00 on cost',
    )
    expect(describeRule({ id: 'x', key: 'price.labor', value: { mode: 'fixed', value: 95 } })).toBe('Fixed $95.00')
  })

  it('describes a tax rule', () => {
    expect(
      describeRule({ id: 'x', key: 'tax', value: { rate: 0.0825, taxable_types: ['glass', 'part'] } }),
    ).toBe('Tax 8.25% on Glass, Additional part')
  })

  it('describes a discount rule with and without a cap', () => {
    expect(describeRule({ id: 'x', key: 'discount', value: { max_percent: 10 } })).toBe('Max discount 10%')
    expect(describeRule({ id: 'x', key: 'discount', value: { max_percent: null } })).toBe('No discount cap')
  })
})
