import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { JobWithRefs } from '../../shared/types.ts'
import { JOB_STATUSES } from '../../shared/types.ts'
import { formatPhone } from '../../shared/validation.ts'
import { StatusBadge, statusTone } from '../ui/StatusBadge.tsx'

export interface JobCardProps {
  job: JobWithRefs
  actions?: ReactNode
}

function ymm(vehicle: JobWithRefs['vehicle']): string | null {
  if (!vehicle) return null
  const parts = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : null
}

export function JobCard({ job, actions }: JobCardProps) {
  const statusLabel = JOB_STATUSES.find((s) => s.value === job.status)?.label ?? job.status
  const vehicleLabel = ymm(job.vehicle)

  return (
    <div className="card-soft">
      <div className="row-between">
        <div className="stack-sm" style={{ gap: 'var(--space-xxs)' }}>
          <Link to={`/jobs/${job.id}`} className="text-heading-sm link-plain" style={{ textDecoration: 'none' }}>
            {job.customer?.name ?? 'No customer'}
          </Link>
          <div className="text-body-sm text-mute">
            {job.customer?.phone ? <div>{formatPhone(job.customer.phone)}</div> : null}
            {vehicleLabel ? <div>{vehicleLabel}</div> : null}
          </div>
          {job.appointment_at ? (
            <div className="text-body-sm">Appointment: {new Date(job.appointment_at).toLocaleString()}</div>
          ) : null}
          {job.quote_id ? <div className="text-caption">Quote {job.quote_id.slice(0, 8)}</div> : null}
        </div>
        <div className="stack-sm" style={{ alignItems: 'flex-end', gap: 'var(--space-xs)' }}>
          <StatusBadge label={statusLabel} tone={statusTone(job.status)} />
          {actions}
        </div>
      </div>
    </div>
  )
}
