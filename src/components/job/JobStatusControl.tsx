import { useState } from 'react'
import type { Job, JobStatus } from '../../shared/types.ts'
import { JOB_STATUSES } from '../../shared/types.ts'
import { updateJobStatus } from '../../data/jobs.ts'
import { SelectField } from '../ui/SelectField.tsx'
import { Button } from '../ui/Button.tsx'
import { FormError } from '../ui/FormError.tsx'

export interface JobStatusControlProps {
  job: Job
  onChanged: (job: Job) => void
}

export function JobStatusControl({ job, onChanged }: JobStatusControlProps) {
  const [status, setStatus] = useState<JobStatus>(job.status)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleUpdate = async () => {
    setError(null)
    setSubmitting(true)
    try {
      const updated = await updateJobStatus(job.id, status)
      onChanged(updated)
    } catch {
      setError('Could not update status. Try again.')
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
          onChange={(e) => setStatus(e.target.value as JobStatus)}
          options={JOB_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
        />
        <Button type="button" variant="secondary" onClick={handleUpdate} disabled={submitting || status === job.status}>
          {submitting ? 'Updating…' : 'Update status'}
        </Button>
      </div>
    </div>
  )
}
