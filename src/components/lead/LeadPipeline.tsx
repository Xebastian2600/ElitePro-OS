import type { LeadWithRefs } from '../../shared/types.ts'
import { LEAD_STATUSES } from '../../shared/types.ts'
import { EmptyState } from '../ui/EmptyState.tsx'
import { LeadCard } from './LeadCard.tsx'

export interface LeadPipelineProps {
  leads: LeadWithRefs[]
}

// Board view: one horizontally-scrollable column per status. On narrow
// screens the columns stack (see .pipeline in base.css).
export function LeadPipeline({ leads }: LeadPipelineProps) {
  if (leads.length === 0) return <EmptyState message="No leads yet." />

  return (
    <div className="pipeline">
      {LEAD_STATUSES.map((status) => {
        const columnLeads = leads.filter((lead) => lead.status === status.value)
        return (
          <div key={status.value} className="pipeline-column">
            <div className="pipeline-column__header">
              {status.label} ({columnLeads.length})
            </div>
            {columnLeads.length === 0 ? (
              <div className="text-caption">No leads.</div>
            ) : (
              columnLeads.map((lead) => <LeadCard key={lead.id} lead={lead} />)
            )}
          </div>
        )
      })}
    </div>
  )
}
