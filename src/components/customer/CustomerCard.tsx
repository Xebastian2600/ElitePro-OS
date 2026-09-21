import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Customer } from '../../shared/types.ts'
import { formatPhone } from '../../shared/validation.ts'

export interface CustomerCardProps {
  customer: Customer
  compact?: boolean
  actions?: ReactNode
}

export function CustomerCard({ customer, compact, actions }: CustomerCardProps) {
  return (
    <div className={compact ? 'card-soft' : 'card'}>
      <div className="row-between">
        <div className="stack-sm" style={{ gap: 'var(--space-xxs)' }}>
          <Link to={`/customers/${customer.id}`} className="text-heading-sm link-plain" style={{ textDecoration: 'none' }}>
            {customer.name}
          </Link>
          <div className="text-body-sm text-mute">
            {customer.phone ? <div>{formatPhone(customer.phone)}</div> : null}
            {customer.email ? <div>{customer.email}</div> : null}
          </div>
          {!compact && customer.address ? <div className="text-body-sm">{customer.address}</div> : null}
          {!compact && customer.notes ? <div className="text-body-sm text-mute">{customer.notes}</div> : null}
        </div>
        {actions}
      </div>
    </div>
  )
}
