import { describe, expect, it } from 'vitest'
import { calculateQuote, formatMoney, fromCents, quoteIsPresentable, toCents } from './calculator.ts'
import type { PricingConfig, QuoteItemInput } from './types.ts'
import { emptyPricingConfig } from './pricing.ts'

function configWithTax(rate: number, taxable_types: QuoteItemInput['type'][], maxDiscountPercent?: number | null): PricingConfig {
  const config = emptyPricingConfig()
  config.rules.tax = { id: 'tax-1', key: 'tax', value: { rate, taxable_types } }
  if (maxDiscountPercent !== undefined) {
    config.rules.discount = { id: 'discount-1', key: 'discount', value: { max_percent: maxDiscountPercent } }
  }
  return config
}

describe('toCents / fromCents', () => {
  it('round-trip dollars <-> cents', () => {
    expect(toCents(19.99)).toBe(1999)
    expect(fromCents(1999)).toBe(19.99)
    expect(fromCents(toCents(0.1) + toCents(0.2))).toBe(0.3)
  })
})

describe('formatMoney', () => {
  it('formats as USD currency', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50')
    expect(formatMoney(0)).toBe('$0.00')
  })
})

describe('calculateQuote — normal quote', () => {
  it('computes gross, tax on a subset of types, subtotal and total', () => {
    const items: QuoteItemInput[] = [
      { type: 'glass', description: 'Windshield', quantity: 1, unit_cost: 100, unit_price: 300 },
      { type: 'labor', description: 'Install labor', quantity: 2, unit_cost: null, unit_price: 50 },
      { type: 'adas', description: 'ADAS calibration', quantity: 1, unit_cost: null, unit_price: 150 },
      { type: 'part', description: 'Clip kit', quantity: 3, unit_cost: 2, unit_price: 5 },
    ]
    // tax only glass + adas
    const config = configWithTax(0.1, ['glass', 'adas'])
    const calc = calculateQuote(items, config)

    expect(calc.gross).toBe(300 + 100 + 150 + 15)
    expect(calc.discount_total).toBe(0)
    expect(calc.subtotal).toBe(calc.gross)
    expect(calc.taxable_base).toBe(300 + 150)
    expect(calc.tax_rate).toBe(0.1)
    expect(calc.tax).toBe(45)
    expect(calc.total).toBe(calc.subtotal + calc.tax)
    expect(quoteIsPresentable(calc)).toBe(true)
    expect(calc.lines[0].taxable).toBe(true)
    expect(calc.lines[1].taxable).toBe(false)
    expect(calc.lines[0].explanation).toBe('1 × $300.00')
  })
})

describe('calculateQuote — zero/optional cases', () => {
  it('flags tax_not_configured as blocking and tax is 0', () => {
    const items: QuoteItemInput[] = [{ type: 'glass', description: 'Windshield', quantity: 1, unit_cost: null, unit_price: 300 }]
    const calc = calculateQuote(items, emptyPricingConfig())
    expect(calc.tax_rate).toBeNull()
    expect(calc.tax).toBe(0)
    expect(calc.issues.some((i) => i.code === 'tax_not_configured' && i.blocking)).toBe(true)
    expect(quoteIsPresentable(calc)).toBe(false)
  })

  it('flags a zero-quantity line as invalid_quantity and contributes 0', () => {
    const items: QuoteItemInput[] = [{ type: 'labor', description: 'Labor', quantity: 0, unit_cost: null, unit_price: 50 }]
    const calc = calculateQuote(items, configWithTax(0.05, []))
    expect(calc.lines[0].line_total).toBe(0)
    expect(calc.issues.some((i) => i.code === 'invalid_quantity' && i.index === 0)).toBe(true)
  })

  it('allows unit_cost null on a priced line', () => {
    const items: QuoteItemInput[] = [{ type: 'labor', description: 'Labor', quantity: 1, unit_cost: null, unit_price: 50 }]
    const calc = calculateQuote(items, configWithTax(0.05, []))
    expect(calc.issues.filter((i) => i.blocking)).toEqual([])
    expect(calc.gross).toBe(50)
  })

  it('flags no_items when there are no non-discount lines', () => {
    const calc = calculateQuote([], configWithTax(0.05, []))
    expect(calc.issues.some((i) => i.code === 'no_items' && i.blocking)).toBe(true)
  })

  it('flags no_items when the only line is a discount', () => {
    const items: QuoteItemInput[] = [{ type: 'discount', description: 'Discount', quantity: 1, unit_cost: null, unit_price: 10 }]
    const calc = calculateQuote(items, configWithTax(0.05, []))
    expect(calc.issues.some((i) => i.code === 'no_items')).toBe(true)
  })
})

describe('calculateQuote — discounts', () => {
  it('applies a fixed-amount discount', () => {
    const items: QuoteItemInput[] = [
      { type: 'glass', description: 'Windshield', quantity: 1, unit_cost: null, unit_price: 500 },
      { type: 'discount', description: 'Loyalty discount', quantity: 1, unit_cost: null, unit_price: 25 },
    ]
    const calc = calculateQuote(items, configWithTax(0, []))
    expect(calc.discount_total).toBe(25)
    expect(calc.lines[1].line_total).toBe(-25)
    expect(calc.lines[1].explanation).toBe('$25.00 discount')
    expect(calc.subtotal).toBe(475)
  })

  it('applies a percent discount of gross', () => {
    const items: QuoteItemInput[] = [
      { type: 'glass', description: 'Windshield', quantity: 1, unit_cost: null, unit_price: 500 },
      { type: 'discount', description: 'Promo', quantity: 1, unit_cost: null, unit_price: 0, metadata: { percent: 10 } },
    ]
    const calc = calculateQuote(items, configWithTax(0, []))
    expect(calc.discount_total).toBe(50)
    expect(calc.lines[1].line_total).toBe(-50)
    expect(calc.lines[1].explanation).toBe('10% of $500.00 gross')
  })

  it('excludes a non-taxable discount from the taxable base', () => {
    const items: QuoteItemInput[] = [
      { type: 'glass', description: 'Windshield', quantity: 1, unit_cost: null, unit_price: 500 },
      { type: 'discount', description: 'Promo', quantity: 1, unit_cost: null, unit_price: 100 },
    ]
    const calc = calculateQuote(items, configWithTax(0.1, ['glass']))
    expect(calc.taxable_base).toBe(500)
    expect(calc.tax).toBe(50)
  })

  it('includes a taxable discount in the taxable base (reduces it)', () => {
    const items: QuoteItemInput[] = [
      { type: 'glass', description: 'Windshield', quantity: 1, unit_cost: null, unit_price: 500 },
      { type: 'discount', description: 'Promo', quantity: 1, unit_cost: null, unit_price: 100 },
    ]
    const calc = calculateQuote(items, configWithTax(0.1, ['glass', 'discount']))
    expect(calc.taxable_base).toBe(400)
    expect(calc.tax).toBe(40)
  })

  it('clamps discount_total to gross and adds a blocking issue when discount exceeds gross', () => {
    const items: QuoteItemInput[] = [
      { type: 'glass', description: 'Windshield', quantity: 1, unit_cost: null, unit_price: 100 },
      { type: 'discount', description: 'Big discount', quantity: 1, unit_cost: null, unit_price: 500 },
    ]
    const calc = calculateQuote(items, configWithTax(0, []))
    expect(calc.discount_total).toBe(100)
    expect(calc.subtotal).toBe(0)
    expect(calc.issues.some((i) => i.code === 'discount_exceeds_gross' && i.blocking)).toBe(true)
  })

  it('flags discount_exceeds_max when a discount cap is configured and exceeded', () => {
    const items: QuoteItemInput[] = [
      { type: 'glass', description: 'Windshield', quantity: 1, unit_cost: null, unit_price: 500 },
      { type: 'discount', description: 'Promo', quantity: 1, unit_cost: null, unit_price: 0, metadata: { percent: 20 } },
    ]
    const calc = calculateQuote(items, configWithTax(0, [], 10))
    expect(calc.issues.some((i) => i.code === 'discount_exceeds_max' && i.blocking)).toBe(true)
  })

  it('does not flag discount_exceeds_max when within the cap', () => {
    const items: QuoteItemInput[] = [
      { type: 'glass', description: 'Windshield', quantity: 1, unit_cost: null, unit_price: 500 },
      { type: 'discount', description: 'Promo', quantity: 1, unit_cost: null, unit_price: 0, metadata: { percent: 5 } },
    ]
    const calc = calculateQuote(items, configWithTax(0, [], 10))
    expect(calc.issues.some((i) => i.code === 'discount_exceeds_max')).toBe(false)
  })
})

describe('calculateQuote — fractional quantities and float traps', () => {
  it('handles a fractional quantity (1.5 hours)', () => {
    const items: QuoteItemInput[] = [{ type: 'labor', description: 'Labor', quantity: 1.5, unit_cost: null, unit_price: 60 }]
    const calc = calculateQuote(items, configWithTax(0, []))
    expect(calc.gross).toBe(90)
  })

  it('avoids float traps: 3 × $19.99 is exactly $59.97', () => {
    const items: QuoteItemInput[] = [{ type: 'part', description: 'Widget', quantity: 3, unit_cost: null, unit_price: 19.99 }]
    const calc = calculateQuote(items, configWithTax(0, []))
    expect(calc.gross).toBe(59.97)
    expect(calc.lines[0].line_total).toBe(59.97)
  })

  it('handles 0.1 + 0.2 style price accumulation exactly', () => {
    const items: QuoteItemInput[] = [
      { type: 'part', description: 'A', quantity: 1, unit_cost: null, unit_price: 0.1 },
      { type: 'part', description: 'B', quantity: 1, unit_cost: null, unit_price: 0.2 },
    ]
    const calc = calculateQuote(items, configWithTax(0, []))
    expect(calc.gross).toBe(0.3)
  })
})

describe('calculateQuote — invalid inputs never produce NaN', () => {
  it('flags NaN quantity and NaN/negative price without producing NaN totals', () => {
    const items: QuoteItemInput[] = [
      { type: 'glass', description: 'Bad qty', quantity: NaN, unit_cost: null, unit_price: 100 },
      { type: 'labor', description: 'Bad price', quantity: 1, unit_cost: null, unit_price: -5 },
      { type: 'part', description: 'Bad cost', quantity: 1, unit_cost: -10, unit_price: 20 },
      { type: 'adas', description: 'Infinite qty', quantity: Infinity, unit_cost: null, unit_price: 20 },
    ]
    const calc = calculateQuote(items, configWithTax(0.1, ['glass', 'labor', 'part', 'adas']))

    expect(Number.isNaN(calc.gross)).toBe(false)
    expect(Number.isNaN(calc.subtotal)).toBe(false)
    expect(Number.isNaN(calc.tax)).toBe(false)
    expect(Number.isNaN(calc.total)).toBe(false)
    for (const line of calc.lines) expect(Number.isNaN(line.line_total)).toBe(false)

    expect(calc.gross).toBe(0)
    expect(calc.issues.filter((i) => i.blocking).length).toBeGreaterThanOrEqual(4)
    expect(quoteIsPresentable(calc)).toBe(false)
  })

  it('total always equals subtotal + tax', () => {
    const items: QuoteItemInput[] = [
      { type: 'glass', description: 'Windshield', quantity: 1, unit_cost: null, unit_price: 333.33 },
      { type: 'discount', description: 'Promo', quantity: 1, unit_cost: null, unit_price: 0, metadata: { percent: 7 } },
    ]
    const calc = calculateQuote(items, configWithTax(0.0825, ['glass']))
    expect(calc.total).toBe(fromCents(toCents(calc.subtotal) + toCents(calc.tax)))
  })
})
