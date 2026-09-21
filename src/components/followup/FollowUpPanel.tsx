import { useState } from 'react'
import { listOpenFollowUpsForSource } from '../../data/followUps.ts'
import { listTeamMembers } from '../../data/team.ts'
import type { FollowUpSourceType } from '../../followup/types.ts'
import { useAsync } from '../ui/useAsync.ts'
import { LoadingLine } from '../ui/LoadingLine.tsx'
import { EmptyState } from '../ui/EmptyState.tsx'
import { Button } from '../ui/Button.tsx'
import { FollowUpRow } from './FollowUpRow.tsx'
import { FollowUpForm } from './FollowUpForm.tsx'

export interface FollowUpPanelProps {
  sourceType: FollowUpSourceType
  sourceId: string
}

export function FollowUpPanel({ sourceType, sourceId }: FollowUpPanelProps) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [showForm, setShowForm] = useState(false)

  const { data: followUps, loading, error, reload } = useAsync(
    () => listOpenFollowUpsForSource(sourceType, sourceId),
    [sourceType, sourceId, refreshKey],
  )
  const { data: teamMembers } = useAsync(() => listTeamMembers(), [])

  const bump = () => setRefreshKey((n) => n + 1)

  return (
    <div className="stack-sm">
      {loading ? <LoadingLine label="Loading follow-ups…" /> : null}
      {error ? <div className="text-error text-body-sm">Could not load follow-ups.</div> : null}

      {!loading && !error ? (
        followUps && followUps.length > 0 ? (
          <div className="stack-sm">
            {followUps.map((followUp) => (
              <FollowUpRow key={followUp.id} followUp={followUp} teamMembers={teamMembers ?? []} onChanged={bump} />
            ))}
          </div>
        ) : (
          <EmptyState message="No open follow-ups." />
        )
      ) : null}

      {showForm ? (
        <FollowUpForm
          source={{ type: sourceType, id: sourceId }}
          onCreated={() => {
            setShowForm(false)
            reload()
            bump()
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(true)}>
          Add follow-up
        </Button>
      )}
    </div>
  )
}
