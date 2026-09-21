import { describe, expect, it } from 'vitest'
import { canTransitionQuote, nextQuoteStatuses, validateQuoteTransition } from './status.ts'
import { QUOTE_STATUSES, QUOTE_TRANSITIONS } from './types.ts'
import type { QuoteCalculation, QuoteStatus } from './types.ts'
import { calculateQuote } from './calculator.ts'
import { emptyPricingConfig } from './pricing.ts'

const ALL_STATUSES: QuoteStatus[] = QUOTE_STATUSES.map((s) => s.value)

function presentableCalculation(): QuoteCalculation {
  const config = emptyPricingConfig()
  config.rules.tax = { id: 'tax-1', key: 'tax', value: { rate: 0, taxable_types: [] } }
  return calculateQuote([{ type: 'glass', description: 'Windshield', quantity: 1, unit_cost: null, unit_price: 100 }], config)
}

function blockingCalculation(): QuoteCalculation {
  return calculateQuote([{ type: 'glass', description: 'Windshield', quantity: 1, unit_cost: null, unit_price: 100 }], emptyPricingConfig())
}

describe('canTransitionQuote / nextQuoteStatuses', () => {
  it('matches QUOTE_TRANSITIONS for the full status matrix', () => {
    for (const from of ALL_STATUSES) {
      expect(nextQuoteStatuses(from)).toEqual(QUOTE_TRANSITIONS[from])
      for (const to of ALL_STATUSES) {
        expect(canTransitionQuote(from, to)).toBe(QUOTE_TRANSITIONS[from].includes(to))
      }
    }
  })
})

describe('validateQuoteTransition', () => {
  it('rejects a disallowed transition', () => {
    const result = validateQuoteTransition({ from: 'approved', to: 'draft', calculation: presentableCalculation() })
    expect(result.ok).toBe(false)
  })

  it('allows a permitted transition with no special requirements', () => {
    const result = validateQuoteTransition({ from: 'presented', to: 'draft', calculation: blockingCalculation() })
    expect(result.ok).toBe(true)
  })

  it('requires a non-blank lost_reason when transitioning to lost', () => {
    expect(validateQuoteTransition({ from: 'draft', to: 'lost', calculation: presentableCalculation() }).ok).toBe(false)
    expect(
      validateQuoteTransition({ from: 'draft', to: 'lost', lost_reason: '   ', calculation: presentableCalculation() }).ok,
    ).toBe(false)
    expect(
      validateQuoteTransition({
        from: 'draft',
        to: 'lost',
        lost_reason: 'Customer went with another shop',
        calculation: presentableCalculation(),
      }).ok,
    ).toBe(true)
  })

  it('blocks presented/approved when the calculation has a blocking issue', () => {
    expect(validateQuoteTransition({ from: 'draft', to: 'presented', calculation: blockingCalculation() }).ok).toBe(false)
    expect(validateQuoteTransition({ from: 'follow_up', to: 'approved', calculation: blockingCalculation() }).ok).toBe(false)
  })

  it('allows presented/approved when the calculation is presentable', () => {
    expect(validateQuoteTransition({ from: 'draft', to: 'presented', calculation: presentableCalculation() }).ok).toBe(true)
    expect(validateQuoteTransition({ from: 'follow_up', to: 'approved', calculation: presentableCalculation() }).ok).toBe(true)
  })
})
