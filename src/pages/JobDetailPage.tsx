import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getJob, updateJob } from '../data/jobs.ts'
import { getCustomer } from '../data/customers.ts'
import { getVehicle } from '../data/vehicles.ts'
import type { Customer, Vehicle } from '../shared/types.ts'
import { ValidationError } from '../data/errors.ts'
import { useAsync } from '../components/ui/useAsync.ts'
import { PageHeader } from '../components/ui/PageHeader.tsx'
import { Section } from '../components/ui/Section.tsx'
import { LoadingLine } from '../components/ui/LoadingLine.tsx'
import { EmptyState } from '../components/ui/EmptyState.tsx'
import { TextField } from '../components/ui/TextField.tsx'
import { TextArea } from '../components/ui/TextArea.tsx'
import { Button } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { StatusBadge, statusTone } from '../components/ui/StatusBadge.tsx'
import { JOB_STATUSES } from '../shared/types.ts'
import { CustomerCard } from '../components/customer/CustomerCard.tsx'
import { VehicleCard } from '../components/vehicle/VehicleCard.tsx'
import { JobStatusControl } from '../components/job/JobStatusControl.tsx'
import { ActivityList } from '../components/activity/ActivityList.tsx'

function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toIsoOrNull(datetimeLocal: string): string | null {
  if (!datetimeLocal) return null
  const date = new Date(datetimeLocal)
  return isNaN(date.getTime()) ? datetimeLocal : date.toISOString()
}

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const jobId = id!

  const [refreshKey, setRefreshKey] = useState(0)
  const { data: job, loading, error } = useAsync(() => getJob(jobId), [jobId, refreshKey])

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)

  useEffect(() => {
    if (job?.customer_id) getCustomer(job.customer_id).then(setCustomer)
  }, [job?.customer_id])

  useEffect(() => {
    if (job?.vehicle_id) getVehicle(job.vehicle_id).then(setVehicle)
  }, [job?.vehicle_id])

  const [editing, setEditing] = useState(false)
  const [appointmentAt, setAppointmentAt] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!job) return
    setAppointmentAt(isoToLocalInput(job.appointment_at))
    setAddress(job.address ?? '')
    setNotes(job.notes ?? '')
  }, [job])

  const bumpRefresh = () => setRefreshKey((n) => n + 1)

  const handleSave = async () => {
    if (!job) return
    setSubmitting(true)
    setErrors({})
    try {
      // Send only edited fields so a stale status/quote_id can't overwrite newer values.
      await updateJob(job.id, {
        appointment_at: toIsoOrNull(appointmentAt),
        address,
        notes,
      })
      setEditing(false)
      bumpRefresh()
    } catch (err) {
      if (err instanceof ValidationError) setErrors(err.errors)
      else setErrors({ _: 'Could not save changes. Try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="container page">
        <LoadingLine label="Loading job…" />
      </div>
    )
  }

  if (error || !job) {
    return (
      <div className="container page">
        <EmptyState message="Job not found." />
      </div>
    )
  }

  const statusLabel = JOB_STATUSES.find((s) => s.value === job.status)?.label ?? job.status

  return (
    <div>
      <PageHeader
        eyebrow="Job"
        title={job.customer?.name ?? 'Job'}
        actions={<StatusBadge label={statusLabel} tone={statusTone(job.status)} onDark />}
      />
      <div className="container page stack-lg">
        <Section title="Customer & vehicle">
          <div className="grid-2">
            {customer ? <CustomerCard customer={customer} compact /> : <LoadingLine label="Loading customer…" />}
            {vehicle ? <VehicleCard vehicle={vehicle} compact /> : <LoadingLine label="Loading vehicle…" />}
          </div>
        </Section>

        <Section title="Status">
          <JobStatusControl job={job} onChanged={bumpRefresh} />
        </Section>

        <Section
          title="Details"
          actions={
            !editing ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : undefined
          }
        >
          {editing ? (
            <div className="stack">
              <FormError message={errors._} />
              <TextField
                label="Appointment"
                type="datetime-local"
                value={appointmentAt}
                onChange={(e) => setAppointmentAt(e.target.value)}
                error={errors.appointment_at}
              />
              <TextField label="Address" value={address} onChange={(e) => setAddress(e.target.value)} error={errors.address} />
              <TextArea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} error={errors.notes} />
              <div className="row">
                <Button type="button" onClick={handleSave} disabled={submitting}>
                  {submitting ? 'Saving…' : 'Save changes'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="stack-sm">
              <div className="text-body-sm">
                Appointment: {job.appointment_at ? new Date(job.appointment_at).toLocaleString() : '—'}
              </div>
              <div className="text-body-sm">Address: {job.address ?? '—'}</div>
              <div className="text-body-sm">Notes: {job.notes ?? '—'}</div>
              <div className="text-body-sm">Quote: {job.quote_id ?? '—'}</div>
            </div>
          )}
        </Section>

        <Section title="Activity">
          <ActivityList entityType="job" entityId={jobId} refreshKey={refreshKey} />
        </Section>
      </div>
    </div>
  )
}
