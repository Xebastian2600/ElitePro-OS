import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listLeads } from '../data/leads.ts'
import type { LeadStatus } from '../shared/types.ts'
import { LEAD_STATUSES } from '../shared/types.ts'
import { useAsync } from '../components/ui/useAsync.ts'
import { PageHeader } from '../components/ui/PageHeader.tsx'
import { Button } from '../components/ui/Button.tsx'
import { FilterPills } from '../components/ui/FilterPills.tsx'
import { LoadingLine } from '../components/ui/LoadingLine.tsx'
import { LeadPipeline } from '../components/lead/LeadPipeline.tsx'
import { LeadCard } from '../components/lead/LeadCard.tsx'
import { EmptyState } from '../components/ui/EmptyState.tsx'

export function LeadsPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<LeadStatus | 'all'>('all')
  const { data: leads, loading, error } = useAsync(
    () => listLeads(filter === 'all' ? {} : { status: filter }),
    [filter],
  )

  return (
    <div>
      <PageHeader
        title="Leads"
        actions={
          <Button type="button" onClick={() => navigate('/leads/new')}>
            New lead
          </Button>
        }
      />
      <div className="container page stack-lg">
        <FilterPills
          aria-label="Filter leads by status"
          value={filter}
          onChange={setFilter}
          options={[{ value: 'all', label: 'All' }, ...LEAD_STATUSES.map((s) => ({ value: s.value, label: s.label }))]}
        />
        {loading ? <LoadingLine label="Loading leads…" /> : null}
        {error ? <div className="text-error text-body-sm">Could not load leads.</div> : null}
        {!loading && !error && filter === 'all' ? <LeadPipeline leads={leads ?? []} /> : null}
        {!loading && !error && filter !== 'all' ? (
          leads && leads.length > 0 ? (
            <div className="table-stack">
              {leads.map((lead) => (
                <LeadCard key={lead.id} lead={lead} />
              ))}
            </div>
          ) : (
            <EmptyState message="No leads with this status." />
          )
        ) : null}
      </div>
    </div>
  )
}
