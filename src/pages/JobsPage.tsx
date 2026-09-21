import { useState } from 'react'
import { listJobs } from '../data/jobs.ts'
import type { JobStatus } from '../shared/types.ts'
import { JOB_STATUSES } from '../shared/types.ts'
import { useAsync } from '../components/ui/useAsync.ts'
import { PageHeader } from '../components/ui/PageHeader.tsx'
import { FilterPills } from '../components/ui/FilterPills.tsx'
import { LoadingLine } from '../components/ui/LoadingLine.tsx'
import { EmptyState } from '../components/ui/EmptyState.tsx'
import { JobCard } from '../components/job/JobCard.tsx'

export function JobsPage() {
  const [filter, setFilter] = useState<JobStatus | 'all'>('all')
  const { data: jobs, loading, error } = useAsync(
    () => listJobs(filter === 'all' ? {} : { status: filter }),
    [filter],
  )

  return (
    <div>
      <PageHeader title="Jobs" />
      <div className="container page stack-lg">
        <FilterPills
          aria-label="Filter jobs by status"
          value={filter}
          onChange={setFilter}
          options={[{ value: 'all', label: 'All' }, ...JOB_STATUSES.map((s) => ({ value: s.value, label: s.label }))]}
        />
        {loading ? <LoadingLine label="Loading jobs…" /> : null}
        {error ? <div className="text-error text-body-sm">Could not load jobs.</div> : null}
        {!loading && !error && jobs && jobs.length > 0 ? (
          <div className="table-stack">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        ) : null}
        {!loading && !error && jobs && jobs.length === 0 ? <EmptyState message="No jobs with this status." /> : null}
      </div>
    </div>
  )
}
