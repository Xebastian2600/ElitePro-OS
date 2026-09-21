import { describe, expect, it } from 'vitest'
import { buildCustomerSummary } from './summary.ts'
import { calculateQuote } from './calculator.ts'
import { emptyPricingConfig } from './pricing.ts'
import type { Customer, Vehicle } from '../shared/types.ts'
import type { QuoteItemInput } from './types.ts'

const customer: Customer = {
  id: 'c1',
  name: 'Jane Doe',
  phone: '+15551234567',
  email: 'jane@example.com',
  address: null,
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const vehicle: Vehicle = {
  id: 'v1',
  customer_id: 'c1',
  year: 2019,
  make: 'Honda',
  model: 'Civic',
  trim: 'EX',
  vin: '1HGCM82633A004352',
  glass_type: 'OEM',
  adas_status: 'not_required',
  verified_status: 'verified',
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const items: QuoteItemInput[] = [
  { type: 'glass', description: 'Windshield', quantity: 1, unit_cost: null, unit_price: 300 },
  { type: 'labor', description: 'Install labor', quantity: 1, unit_cost: null, unit_price: 50 },
]

describe('buildCustomerSummary', () => {
  it('contains the customer name, vehicle, line items and totals when tax is configured', () => {
    const config = emptyPricingConfig()
    config.rules.tax = { id: 'tax-1', key: 'tax', value: { rate: 0.0825, taxable_types: ['glass'] } }
    const calculation = calculateQuote(items, config)

    const summary = buildCustomerSummary({ customer, vehicle, items, calculation })

    expect(summary).toContain('Jane Doe')
    expect(summary).toContain('2019 Honda Civic EX')
    expect(summary).toContain(vehicle.vin as string)
    expect(summary).toContain('Windshield')
    expect(summary).toContain('Install labor')
    expect(summary).toContain('Subtotal: $350.00')
    expect(summary).toContain('Tax (8.25%): $24.75')
    expect(summary).toContain('Total: $374.75')
  })

  it('shows "to be confirmed" tax and "Total before tax" when tax is not configured', () => {
    const config = emptyPricingConfig()
    const calculation = calculateQuote(items, config)

    const summary = buildCustomerSummary({ customer, vehicle, items, calculation })

    expect(summary).toContain('Tax: to be confirmed')
    expect(summary).toContain('Total before tax: $350.00')
  })

  it('includes notes when present', () => {
    const config = emptyPricingConfig()
    const calculation = calculateQuote(items, config)
    const summary = buildCustomerSummary({ customer, vehicle, items, calculation, notes: 'Please call ahead.' })
    expect(summary).toContain('Please call ahead.')
  })

  it('shows a discount line as negative', () => {
    const withDiscount: QuoteItemInput[] = [
      ...items,
      { type: 'discount', description: 'Loyalty discount', quantity: 1, unit_cost: null, unit_price: 20 },
    ]
    const config = emptyPricingConfig()
    const calculation = calculateQuote(withDiscount, config)
    const summary = buildCustomerSummary({ customer, vehicle, items: withDiscount, calculation })
    expect(summary).toContain('Loyalty discount — 1 × $20.00 = -$20.00')
  })

  it('never contains invented policy terms', () => {
    const config = emptyPricingConfig()
    config.rules.tax = { id: 'tax-1', key: 'tax', value: { rate: 0.0825, taxable_types: ['glass'] } }
    const calculation = calculateQuote(items, config)
    const summary = buildCustomerSummary({ customer, vehicle, items, calculation, notes: 'Thanks for choosing us.' })

    const lower = summary.toLowerCase()
    expect(lower).not.toContain('warranty')
    expect(lower).not.toContain('valid')
    expect(lower).not.toContain('guarantee')
    expect(lower).not.toContain('payment')
  })

  it('is deterministic for the same inputs', () => {
    const config = emptyPricingConfig()
    const calculation = calculateQuote(items, config)
    const a = buildCustomerSummary({ customer, vehicle, items, calculation })
    const b = buildCustomerSummary({ customer, vehicle, items, calculation })
    expect(a).toBe(b)
  })
})
