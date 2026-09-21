import type { Customer } from '../../shared/types.ts'
import { formatPhone } from '../../shared/validation.ts'
import { Button } from '../ui/Button.tsx'

export interface CustomerMatchNoticeProps {
  customer: Customer
  message?: string
  onUse: (customer: Customer) => void
}

// Shown when a phone/email match is found, before the CSR accidentally creates a duplicate.
export function CustomerMatchNotice({ customer, message, onUse }: CustomerMatchNoticeProps) {
  return (
    <div className="match-notice" role="status">
      <div>
        <div className="text-body-md">
          {message ?? 'Existing customer found:'} <strong>{customer.name}</strong>
        </div>
        <div className="text-body-sm text-mute">
          {customer.phone ? formatPhone(customer.phone) : null}
          {customer.phone && customer.email ? ' · ' : null}
          {customer.email ?? null}
        </div>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={() => onUse(customer)}>
        Use this customer
      </Button>
    </div>
  )
}
