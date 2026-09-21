import { useState } from 'react'
import { useAuth } from '../lib/auth.tsx'
import { listFollowUps } from '../data/followUps.ts'
import { listTeamMembers } from '../data/team.ts'
import { dueState, sortQueue } from '../followup/due.ts'
import type { FollowUpWithSource } from '../followup/types.ts'
import { useAsync } from '../components/ui/useAsync.ts'
import { PageHeader } from '../components/ui/PageHeader.tsx'
import { Section } from '../components/ui/Section.tsx'
import { FilterPills } from '../components/ui/FilterPills.tsx'
import { SelectField } from '../components/ui/SelectField.tsx'
import { LoadingLine } from '../components/ui/LoadingLine.tsx'
import { EmptyState } from '../components/ui/EmptyState.tsx'
import { FollowUpRow } from '../components/followup/FollowUpRow.tsx'

type ViewOption = 'overdue' | 'due_today' | 'upcoming' | 'all_open' | 'done'

export function FollowUpsPage() {
  const { user } = useAuth()
  const [view, setView] = useState<ViewOption>('overdue')
  const [ownerFilter, setOwnerFilter] = useState<string>('everyone')
  const [refreshKey, setRefreshKey] = useState(0)

  const ownerId = ownerFilter === 'everyone' ? undefined : ownerFilter === 'me' ? user?.id : ownerFilter

  const {
    data: openList,
    loading: openLoading,
    error: openError,
    reload: reloadOpen,
  } = useAsync(() => listFollowUps({ status: 'open', ownerId, limit: 500 }), [ownerId, refreshKey])

  const {
    data: doneList,
    loading: doneLoading,
    error: doneError,
    reload: reloadDone,
  } = useAsync(() => listFollowUps({ status: 'done', ownerId, limit: 500 }), [ownerId, refreshKey])

  const { data: teamMembers } = useAsync(() => listTeamMembers(), [])

  const bump = () => {
    setRefreshKey((n) => n + 1)
    reloadOpen()
    reloadDone()
  }

  const now = new Date()
  const open = openList ?? []
  const done = doneList ?? []

  const buckets: Record<ViewOption, FollowUpWithSource[]> = {
    overdue: open.filter((f) => dueState(f.due_at, now) === 'overdue'),
    due_today: open.filter((f) => dueState(f.due_at, now) === 'due_today'),
    upcoming: open.filter((f) => dueState(f.due_at, now) === 'upcoming'),
    all_open: sortQueue(open, now),
    done,
  }

  const VIEW_OPTIONS: { value: ViewOption; label: string }[] = [
    { value: 'overdue', label: `Overdue (${buckets.overdue.length})` },
    { value: 'due_today', label: `Due today (${buckets.due_today.length})` },
    { value: 'upcoming', label: `Upcoming (${buckets.upcoming.length})` },
    { value: 'all_open', label: `All open (${buckets.all_open.length})` },
    { value: 'done', label: `Done (${buckets.done.length})` },
  ]

  const rows = buckets[view]
  const loading = view === 'done' ? doneLoading : openLoading
  const error = view === 'done' ? doneError : openError

  return (
    <div>
      <PageHeader eyebrow="ElitePro OS" title="Follow-ups" />
      <div className="container page stack-lg">
        <Section>
          <div className="stack">
            <FilterPills aria-label="View" options={VIEW_OPTIONS} value={view} onChange={(v) => setView(v as ViewOption)} />
            <SelectField
              label="Owner"
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              options={[
                { value: 'everyone', label: 'Everyone' },
                { value: 'me', label: 'Me' },
                ...(teamMembers ?? [])
                  .filter((m) => m.id !== user?.id)
                  .map((m) => ({ value: m.id, label: m.email })),
              ]}
            />
          </div>
        </Section>

        <Section>
          {loading ? <LoadingLine label="Loading follow-ups…" /> : null}
          {error ? <div className="text-error text-body-sm">Could not load follow-ups.</div> : null}

          {!loading && !error ? (
            rows.length > 0 ? (
              <div className="stack-sm">
                {rows.map((followUp) => (
                  <FollowUpRow key={followUp.id} followUp={followUp} teamMembers={teamMembers ?? []} onChanged={bump} />
                ))}
              </div>
            ) : (
              <EmptyState message="No follow-ups in this view." />
            )
          ) : null}
        </Section>
      </div>
    </div>
  )
}
