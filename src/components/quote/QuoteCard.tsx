import { Link } from 'react-router-dom'
import type { QuoteWithRefs } from '../../data/quotes.ts'
import { QUOTE_STATUSES } from '../../quote/types.ts'
import { formatMoney } from '../../quote/calculator.ts'
import { StatusBadge, statusTone } from '../ui/StatusBadge.tsx'

export interface QuoteCardProps {
  quote: QuoteWithRefs
}

function ymm(vehicle: QuoteWithRefs['vehicle']): string | null {
  if (!vehicle) return null
  const parts = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : null
}

export function QuoteCard({ quote }: QuoteCardProps) {
  const statusLabel = QUOTE_STATUSES.find((s) => s.value === quote.status)?.label ?? quote.status
  const vehicleLabel = ymm(quote.vehicle)

  return (
    <Link to={`/quotes/${quote.id}`} className="table-stack-row">
      <div className="row-between">
        <div className="stack-sm" style={{ gap: 'var(--space-xxs)' }}>
          <div className="text-heading-sm">{quote.customer?.name ?? 'No customer'}</div>
          <div className="text-body-sm text-mute">{vehicleLabel ?? '—'}</div>
          <div className="text-caption">Updated {new Date(quote.updated_at).toLocaleDateString()}</div>
        </div>
        <div className="stack-sm" style={{ alignItems: 'flex-end', gap: 'var(--space-xs)' }}>
          <StatusBadge label={statusLabel} tone={statusTone(quote.status)} />
          <div className="text-body-sm">{formatMoney(quote.total)}</div>
        </div>
      </div>
    </Link>
  )
}
