import { useAuth } from '../../lib/auth.tsx'
import { listActivityForEntity } from '../../data/activity.ts'
import type { EntityType } from '../../shared/types.ts'
import { useAsync } from '../ui/useAsync.ts'
import { LoadingLine } from '../ui/LoadingLine.tsx'
import { EmptyState } from '../ui/EmptyState.tsx'
import { describeActivity } from './describeActivity.ts'

export interface ActivityListProps {
  entityType: EntityType
  entityId: string
  // Bump this from the parent after a mutation to reload the list.
  refreshKey?: number
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
          <div>{describeActivity(activity)}</div>
          <div className="text-caption">
            {activity.actor_id === user?.id ? 'You' : 'Team member'} · {formatTimestamp(activity.created_at)}
          </div>
        </li>
      ))}
    </ul>
  )
}
