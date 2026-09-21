import { useState } from 'react'
import { useAuth } from '../lib/auth.tsx'
import { listTeamMembers } from '../data/team.ts'
import type { EntityType } from '../shared/types.ts'
import { useAsync } from '../components/ui/useAsync.ts'
import { PageHeader } from '../components/ui/PageHeader.tsx'
import { Section } from '../components/ui/Section.tsx'
import { TextField } from '../components/ui/TextField.tsx'
import { SelectField } from '../components/ui/SelectField.tsx'
import { FilterPills } from '../components/ui/FilterPills.tsx'
import { ActivityFeed } from '../components/activity/ActivityFeed.tsx'
import { entityLabel } from '../components/activity/describeActivity.ts'

const ENTITY_TYPES: EntityType[] = ['lead', 'quote', 'job', 'customer', 'vehicle', 'follow_up', 'pricing_rule']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function defaultFrom(): string {
  const d = new Date()
  d.setDate(d.getDate() - 6)
  return toDateInputValue(d)
}

function defaultTo(): string {
  return toDateInputValue(new Date())
}

function startOfDayIso(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toISOString()
}

function endOfDayIso(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return d.toISOString()
}

export function ActivityPage() {
  const { user } = useAuth()
  const [fromDate, setFromDate] = useState(defaultFrom)
  const [toDate, setToDate] = useState(defaultTo)
  const [userFilter, setUserFilter] = useState('everyone')
  const [entityTypeFilter, setEntityTypeFilter] = useState<EntityType | 'all'>('all')

  const { data: teamMembers } = useAsync(() => listTeamMembers(), [])

  const actorId = userFilter === 'everyone' ? undefined : userFilter === 'me' ? user?.id : userFilter
  const entityTypes = entityTypeFilter === 'all' ? undefined : [entityTypeFilter]

  return (
    <div>
      <PageHeader eyebrow="ElitePro OS" title="Activity" />
      <div className="container page stack-lg">
        <Section>
          <div className="stack">
            <div className="grid-2">
              <TextField label="From" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              <TextField label="To" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <SelectField
              label="User"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              options={[
                { value: 'everyone', label: 'Everyone' },
                { value: 'me', label: 'Me' },
                ...(teamMembers ?? [])
                  .filter((m) => m.id !== user?.id)
                  .map((m) => ({ value: m.id, label: m.email })),
              ]}
            />
            <FilterPills
              aria-label="Entity type"
              options={[
                { value: 'all' as const, label: 'All' },
                ...ENTITY_TYPES.map((t) => ({ value: t, label: entityLabel(t) })),
              ]}
              value={entityTypeFilter}
              onChange={(v) => setEntityTypeFilter(v)}
            />
          </div>
        </Section>

        <Section>
          <ActivityFeed
            from={startOfDayIso(fromDate)}
            to={endOfDayIso(toDate)}
            actorId={actorId}
            entityTypes={entityTypes}
            limit={30}
            teamMembers={teamMembers ?? []}
            emptyMessage="No activity in this range."
          />
        </Section>
      </div>
    </div>
  )
}
