import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { QuoteBreakdown } from './QuoteBreakdown.tsx'
import { calculateQuote } from '../../quote/calculator.ts'
import { emptyPricingConfig } from '../../quote/pricing.ts'
import type { QuoteItemInput } from '../../quote/types.ts'

const items: QuoteItemInput[] = [
  { type: 'glass', description: 'Windshield', quantity: 1, unit_cost: 100, unit_price: 250, metadata: {} },
]

describe('QuoteBreakdown', () => {
  it('renders totals from calculateQuote for a given config', () => {
    const config = emptyPricingConfig()
    config.rules.tax = { id: 'rule-tax', key: 'tax', value: { rate: 0.08, taxable_types: ['glass'] } }
    const calc = calculateQuote(items, config)

    render(<QuoteBreakdown calculation={calc} />)

    expect(screen.getByText('Windshield')).toBeInTheDocument()
    expect(screen.getByText('Gross')).toBeInTheDocument()

    const totalRow = screen.getByText('Total').closest('.row-between')
    expect(totalRow).toHaveTextContent('$270.00')
  })

  it('shows a tax-not-configured message when the quote has no tax rule', () => {
    const config = emptyPricingConfig()
    const calc = calculateQuote(items, config)

    render(<QuoteBreakdown calculation={calc} />)

    expect(screen.getByText('Tax (not configured)')).toBeInTheDocument()
    expect(screen.getByText(/tax rule not configured — set it in pricing settings/i)).toBeInTheDocument()
  })
})
