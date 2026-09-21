import { useState } from 'react'
import type { Lead, LeadStatus } from '../../shared/types.ts'
import { LEAD_STATUSES } from '../../shared/types.ts'
import { updateLeadStatus } from '../../data/leads.ts'
import { ValidationError } from '../../data/errors.ts'
import { SelectField } from '../ui/SelectField.tsx'
import { TextField } from '../ui/TextField.tsx'
import { Button } from '../ui/Button.tsx'
import { FormError } from '../ui/FormError.tsx'

export interface LeadStatusControlProps {
  lead: Lead
  onChanged: (lead: Lead) => void
}

export function LeadStatusControl({ lead, onChanged }: LeadStatusControlProps) {
  const [status, setStatus] = useState<LeadStatus>(lead.status)
  const [lostReason, setLostReason] = useState(lead.lost_reason ?? '')
  const [error, setError] = useState<string | null>(null)
  const [lostReasonError, setLostReasonError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isDirty = status !== lead.status || (status === 'lost' && lostReason !== (lead.lost_reason ?? ''))

  const handleUpdate = async () => {
    setError(null)
    setLostReasonError(null)

    // Guard client-side so we never round-trip a Lost status without a reason.
    if (status === 'lost' && lostReason.trim() === '') {
      setLostReasonError('Lost reason is required.')
      return
    }

    setSubmitting(true)
    try {
      const updated = await updateLeadStatus(lead.id, status, status === 'lost' ? lostReason : null)
      onChanged(updated)
    } catch (err) {
      if (err instanceof ValidationError) {
        setLostReasonError(err.errors.lost_reason ?? null)
        setError(err.errors._ ?? null)
      } else {
        setError('Could not update status. Try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="stack-sm">
      <FormError message={error} />
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <SelectField
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as LeadStatus)}
          options={LEAD_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
        />
        <Button type="button" variant="secondary" onClick={handleUpdate} disabled={submitting || !isDirty}>
          {submitting ? 'Updating…' : 'Update status'}
        </Button>
      </div>
      {status === 'lost' ? (
        <TextField
          label="Lost reason"
          value={lostReason}
          onChange={(e) => setLostReason(e.target.value)}
          error={lostReasonError}
          required
        />
      ) : null}
    </div>
  )
}
