import { useAuth } from '../../lib/auth.tsx'
import { listActivityForEntity } from '../../data/activity.ts'
import type { Activity, EntityType } from '../../shared/types.ts'
import { JOB_STATUSES, LEAD_STATUSES } from '../../shared/types.ts'
import { useAsync } from '../ui/useAsync.ts'
import { LoadingLine } from '../ui/LoadingLine.tsx'
import { EmptyState } from '../ui/EmptyState.tsx'

export interface ActivityListProps {
  entityType: EntityType
  entityId: string
  // Bump this from the parent after a mutation to reload the list.
  refreshKey?: number
}

function statusLabel(entityType: EntityType, value: unknown): string {
  const str = typeof value === 'string' ? value : String(value)
  const options = entityType === 'job' ? JOB_STATUSES : LEAD_STATUSES
  return options.find((s) => s.value === str)?.label ?? str
}

function entityLabel(entityType: EntityType): string {
  switch (entityType) {
    case 'customer':
      return 'Customer'
    case 'vehicle':
      return 'Vehicle'
    case 'lead':
      return 'Lead'
    case 'job':
      return 'Job'
  }
}

function describe(activity: Activity): string {
  const { action, entity_type, metadata } = activity

  if (action.endsWith('.created')) {
    return `${entityLabel(entity_type)} created`
  }

  if (action.endsWith('.status_changed')) {
    const from = statusLabel(entity_type, metadata.from)
    const to = statusLabel(entity_type, metadata.to)
    return `Status changed from ${from} to ${to}`
  }

  if (action.endsWith('.updated')) {
    const changed = Array.isArray(metadata.changed) ? (metadata.changed as string[]) : []
    return changed.length > 0 ? `Updated: ${changed.join(', ')}` : 'Updated'
  }

  return action
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function ActivityList({ entityType, entityId, refreshKey }: ActivityListProps) {
  const { user } = useAuth()
  const { data, loading, error } = useAsync(
    () => listActivityForEntity(entityType, entityId),
    [entityType, entityId, refreshKey],
  )

  if (loading) return <LoadingLine label="Loading activity…" />
  if (error) return <div className="text-error text-body-sm">Could not load activity.</div>
  if (!data || data.length === 0) return <EmptyState message="No activity yet." />

  return (
    <ul className="stack-sm">
      {data.map((activity) => (
        <li key={activity.id} className="text-body-sm" style={{ borderBottom: '1px solid var(--color-hairline)', paddingBottom: 'var(--space-xs)' }}>
          <div>{describe(activity)}</div>
          <div className="text-caption">
            {activity.actor_id === user?.id ? 'You' : 'Team member'} · {formatTimestamp(activity.created_at)}
          </div>
        </li>
      ))}
    </ul>
  )
}
