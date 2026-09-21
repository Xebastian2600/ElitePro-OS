import { useState } from 'react'
import type { Quote, QuoteCalculation, QuoteStatus } from '../../quote/types.ts'
import { QUOTE_STATUSES } from '../../quote/types.ts'
import { nextQuoteStatuses, validateQuoteTransition } from '../../quote/status.ts'
import { updateQuoteStatus } from '../../data/quotes.ts'
import { SelectField } from '../ui/SelectField.tsx'
import { TextField } from '../ui/TextField.tsx'
import { Button } from '../ui/Button.tsx'
import { FormError } from '../ui/FormError.tsx'

export interface QuoteStatusControlProps {
  quote: Quote
  calculation: QuoteCalculation
  onChanged: (quote: Quote) => void
  disabled?: boolean
  disabledReason?: string
}

export function QuoteStatusControl({ quote, calculation, onChanged, disabled, disabledReason }: QuoteStatusControlProps) {
  const options = nextQuoteStatuses(quote.status)
  const [status, setStatus] = useState<QuoteStatus>(options[0] ?? quote.status)
  const [lostReason, setLostReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (options.length === 0) {
    return <div className="text-body-sm text-mute">This quote's status is final — no further transitions are available.</div>
  }

  const validation = validateQuoteTransition({
    from: quote.status,
    to: status,
    lost_reason: lostReason,
    calculation,
  })

  const handleUpdate = async () => {
    setError(null)
    setSubmitting(true)
    try {
      const updated = await updateQuoteStatus(quote.id, status, status === 'lost' ? lostReason : undefined)
      onChanged(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update status. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const blocked = disabled || !validation.ok

  return (
    <div className="stack-sm">
      <FormError message={error} />
      {disabled && disabledReason ? <div className="notice">{disabledReason}</div> : null}
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <SelectField
          label="New status"
          value={status}
          onChange={(e) => setStatus(e.target.value as QuoteStatus)}
          options={options.map((s) => ({ value: s, label: QUOTE_STATUSES.find((o) => o.value === s)?.label ?? s }))}
          disabled={disabled}
        />
        <Button type="button" variant="secondary" onClick={handleUpdate} disabled={submitting || blocked}>
          {submitting ? 'Updating…' : 'Update status'}
        </Button>
      </div>
      {status === 'lost' ? (
        <TextField
          label="Lost reason"
          value={lostReason}
          onChange={(e) => setLostReason(e.target.value)}
          disabled={disabled}
          required
        />
      ) : null}
      {!disabled && !validation.ok ? <div className="text-caption">{validation.error}</div> : null}
    </div>
  )
}
