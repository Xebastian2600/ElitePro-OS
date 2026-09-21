import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { Job } from '../../shared/types.ts'
import { createJobFromQuote } from '../../data/jobs.ts'
import { DuplicateError, ValidationError } from '../../data/errors.ts'
import { TextField } from '../ui/TextField.tsx'
import { TextArea } from '../ui/TextArea.tsx'
import { Button } from '../ui/Button.tsx'
import { FormError } from '../ui/FormError.tsx'

export interface JobFormProps {
  customerId: string
  vehicleId: string
  defaultAddress?: string | null
  onCreated: (job: Job) => void
}

// Creates a job from an already-generated quote (quote workspace is owned by
// Workstream B). Used from the lead detail page's "Create job from quote" panel.
export function JobForm({ customerId, vehicleId, defaultAddress, onCreated }: JobFormProps) {
  const [quoteId, setQuoteId] = useState('')
  const [appointmentAt, setAppointmentAt] = useState('')
  const [address, setAddress] = useState(defaultAddress ?? '')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [duplicateJob, setDuplicateJob] = useState<Job | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setErrors({})
    setDuplicateJob(null)

    try {
      const job = await createJobFromQuote({
        quote_id: quoteId.trim(),
        customer_id: customerId,
        vehicle_id: vehicleId,
        appointment_at: appointmentAt ? new Date(appointmentAt).toISOString() : null,
        address,
        notes,
      })
      onCreated(job)
    } catch (err) {
      if (err instanceof ValidationError) {
        setErrors(err.errors)
      } else if (err instanceof DuplicateError) {
        if (err.existing) {
          setDuplicateJob(err.existing as Job)
        } else {
          setErrors({ [err.field]: err.message })
        }
      } else {
        setErrors({ _: 'Could not create this job. Try again.' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit} noValidate>
      <FormError message={errors._} />
      {duplicateJob ? (
        <div className="match-notice" role="status">
          <div className="text-body-md">A job for this quote already exists.</div>
          <Link to={`/jobs/${duplicateJob.id}`} className="link-plain">
            View existing job
          </Link>
        </div>
      ) : null}
      <TextField
        label="Quote ID"
        value={quoteId}
        onChange={(e) => setQuoteId(e.target.value)}
        error={errors.quote_id}
        hint="Quote ID from the quote workspace."
        required
      />
      <TextField
        label="Appointment"
        type="datetime-local"
        value={appointmentAt}
        onChange={(e) => setAppointmentAt(e.target.value)}
        error={errors.appointment_at}
      />
      <TextField label="Address" value={address ?? ''} onChange={(e) => setAddress(e.target.value)} error={errors.address} />
      <TextArea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} error={errors.notes} />
      <Button type="submit" className="btn-cta" disabled={submitting}>
        {submitting ? 'Creating job…' : 'Create job'}
      </Button>
    </form>
  )
}
