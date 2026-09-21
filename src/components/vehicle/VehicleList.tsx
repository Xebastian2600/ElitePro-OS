import type { Vehicle } from '../../shared/types.ts'
import { EmptyState } from '../ui/EmptyState.tsx'
import { Button } from '../ui/Button.tsx'
import { VehicleCard } from './VehicleCard.tsx'

export interface VehicleListProps {
  vehicles: Vehicle[]
  onEdit?: (vehicle: Vehicle) => void
  emptyMessage?: string
}

export function VehicleList({ vehicles, onEdit, emptyMessage = 'No vehicles on file yet.' }: VehicleListProps) {
  if (vehicles.length === 0) return <EmptyState message={emptyMessage} />

  return (
    <div className="table-stack">
      {vehicles.map((vehicle) => (
        <VehicleCard
          key={vehicle.id}
          vehicle={vehicle}
          compact
          actions={
            onEdit ? (
              <Button type="button" variant="outline" size="sm" onClick={() => onEdit(vehicle)}>
                Edit
              </Button>
            ) : undefined
          }
        />
      ))}
    </div>
  )
}
