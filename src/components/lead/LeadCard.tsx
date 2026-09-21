import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LeadWithRefs } from '../../shared/types.ts'
import { LEAD_STATUSES } from '../../shared/types.ts'
import { formatPhone } from '../../shared/validation.ts'
import { StatusBadge, statusTone } from '../ui/StatusBadge.tsx'

export interface LeadCardProps {
  lead: LeadWithRefs
  actions?: ReactNode
}

function ymm(vehicle: LeadWithRefs['vehicle']): string | null {
  if (!vehicle) return null
  const parts = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : null
}

export function LeadCard({ lead, actions }: LeadCardProps) {
  const statusLabel = LEAD_STATUSES.find((s) => s.value === lead.status)?.label ?? lead.status
  const vehicleLabel = ymm(lead.vehicle)

  return (
    <div className="card-soft">
      <div className="row-between">
        <div className="stack-sm" style={{ gap: 'var(--space-xxs)' }}>
          <Link to={`/leads/${lead.id}`} className="text-heading-sm link-plain" style={{ textDecoration: 'none' }}>
            {lead.customer?.name ?? 'No customer'}
          </Link>
          <div className="text-body-sm text-mute">
            {lead.customer?.phone ? <div>{formatPhone(lead.customer.phone)}</div> : null}
            {vehicleLabel ? <div>{vehicleLabel}</div> : null}
          </div>
          {lead.request ? <div className="text-body-sm">{lead.request}</div> : null}
          {lead.source ? <div className="text-caption">Source: {lead.source}</div> : null}
          {lead.next_action ? (
            <div className="text-body-sm">
              Next: {lead.next_action}
              {lead.next_action_at ? ` — ${new Date(lead.next_action_at).toLocaleString()}` : ''}
            </div>
          ) : null}
        </div>
        <div className="stack-sm" style={{ alignItems: 'flex-end', gap: 'var(--space-xs)' }}>
          <StatusBadge label={statusLabel} tone={statusTone(lead.status)} />
          {actions}
        </div>
      </div>
    </div>
  )
}
