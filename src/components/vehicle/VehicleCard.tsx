import type { ReactNode } from 'react'
import type { Vehicle } from '../../shared/types.ts'
import { ADAS_STATUSES, VERIFIED_STATUSES } from '../../shared/types.ts'

export interface VehicleCardProps {
  vehicle: Vehicle
  compact?: boolean
  actions?: ReactNode
}

function ymm(vehicle: Vehicle): string {
  const parts = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : 'Unknown vehicle'
}

export function VehicleCard({ vehicle, compact, actions }: VehicleCardProps) {
  const adasLabel = ADAS_STATUSES.find((s) => s.value === vehicle.adas_status)?.label ?? vehicle.adas_status
  const verifiedLabel = VERIFIED_STATUSES.find((s) => s.value === vehicle.verified_status)?.label ?? vehicle.verified_status

  return (
    <div className={compact ? 'card-soft' : 'card'}>
      <div className="row-between">
        <div className="stack-sm" style={{ gap: 'var(--space-xxs)' }}>
          <div className="text-heading-sm">{ymm(vehicle)}</div>
          <div className="text-body-sm text-mute">
            {vehicle.vin ? <div>VIN {vehicle.vin}</div> : null}
            {vehicle.glass_type ? <div>{vehicle.glass_type}</div> : null}
          </div>
          <div className="row" style={{ gap: 'var(--space-xs)' }}>
            <span className="badge badge-neutral">
              <span className="badge__dot" aria-hidden="true" />
              ADAS: {adasLabel}
            </span>
            <span className="badge badge-neutral">
              <span className="badge__dot" aria-hidden="true" />
              {verifiedLabel}
            </span>
          </div>
          {!compact && vehicle.notes ? <div className="text-body-sm text-mute">{vehicle.notes}</div> : null}
        </div>
        {actions}
      </div>
    </div>
  )
}
