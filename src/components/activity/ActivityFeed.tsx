import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth.tsx'
import { listActivityFeed } from '../../data/activityFeed.ts'
import type { Activity, EntityType } from '../../shared/types.ts'
import type { TeamMember } from '../../data/team.ts'
import { LoadingLine } from '../ui/LoadingLine.tsx'
import { EmptyState } from '../ui/EmptyState.tsx'
import { Button } from '../ui/Button.tsx'
import { describeActivity, entityHref, entityLabel } from './describeActivity.ts'

export interface ActivityFeedProps {
  from?: string
  to?: string
  actorId?: string
  entityTypes?: EntityType[]
  limit?: number
  // Bump to reload from the top (e.g. the Command Center's Refresh).
  refreshKey?: number
  teamMembers?: TeamMember[]
  emptyMessage?: string
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function ActivityFeed({ from, to, actorId, entityTypes, limit = 20, refreshKey, teamMembers, emptyMessage = 'No activity yet.' }: ActivityFeedProps) {
  const { user } = useAuth()
  const [items, setItems] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [hasMore, setHasMore] = useState(false)
  const requestId = useRef(0)

  const entityTypesKey = entityTypes?.join(',') ?? ''

  useEffect(() => {
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    listActivityFeed({ from, to, actorId, entityTypes, limit })
      .then((rows) => {
        if (id !== requestId.current) return
        setItems(rows)
        setHasMore(rows.length === limit)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return
        setError(err)
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, actorId, entityTypesKey, limit, refreshKey])

  async function loadMore() {
    if (items.length === 0) return
    setLoadingMore(true)
    try {
      const before = items[items.length - 1].created_at
      const rows = await listActivityFeed({ from, to, actorId, entityTypes, limit, before })
      setItems((prev) => [...prev, ...rows])
      setHasMore(rows.length === limit)
    } catch {
      setHasMore(false)
    } finally {
      setLoadingMore(false)
    }
  }

  if (loading) return <LoadingLine label="Loading activity…" />
  if (error) return <div className="text-error text-body-sm">Could not load activity.</div>
  if (items.length === 0) return <EmptyState message={emptyMessage} />

  return (
    <div className="stack-sm">
      <ul className="stack-sm">
        {items.map((activity) => {
          const href = entityHref(activity)
          const actorLabel =
            activity.actor_id == null
              ? 'System'
              : activity.actor_id === user?.id
                ? 'You'
                : (teamMembers?.find((m) => m.id === activity.actor_id)?.email ?? 'Team member')

          return (
            <li
              key={activity.id}
              className="text-body-sm"
              style={{ borderBottom: '1px solid var(--color-hairline)', paddingBottom: 'var(--space-xs)' }}
            >
              <div>
                {describeActivity(activity)}
                <span className="text-caption"> · {entityLabel(activity.entity_type)}</span>
                {href ? (
                  <>
                    {' '}
                    <Link to={href} className="link-plain">
                      View
                    </Link>
                  </>
                ) : null}
              </div>
              <div className="text-caption">
                {actorLabel} · {formatTimestamp(activity.created_at)}
              </div>
            </li>
          )
        })}
      </ul>
      {hasMore ? (
        <Button type="button" variant="outline" size="sm" disabled={loadingMore} onClick={loadMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
    </div>
  )
}
