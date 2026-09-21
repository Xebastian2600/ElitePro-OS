import { useState } from 'react'
import type { Customer, Vehicle } from '../../shared/types.ts'
import type { QuoteCalculation, QuoteItemInput } from '../../quote/types.ts'
import { buildCustomerSummary } from '../../quote/summary.ts'
import { Button } from '../ui/Button.tsx'

export interface QuoteSummaryProps {
  customer: Customer
  vehicle: Vehicle
  items: QuoteItemInput[]
  calculation: QuoteCalculation
  notes?: string | null
}

export function QuoteSummary({ customer, vehicle, items, calculation, notes }: QuoteSummaryProps) {
  const summary = buildCustomerSummary({ customer, vehicle, items, calculation, notes })
  const [copyMessage, setCopyMessage] = useState<string | null>(null)

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(summary)
      setCopyMessage('Copied to clipboard.')
    } catch {
      setCopyMessage('Could not copy automatically — select the text and copy it manually.')
    }
  }

  return (
    <div className="stack-sm">
      <textarea className="textarea" readOnly rows={12} value={summary} aria-label="Customer-ready quote summary" />
      <div className="row" style={{ alignItems: 'center' }}>
        <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
          Copy
        </Button>
        {copyMessage ? (
          <span className="text-caption" role="status">
            {copyMessage}
          </span>
        ) : null}
      </div>
    </div>
  )
}
