import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/ui/PageHeader.tsx'
import { Section } from '../components/ui/Section.tsx'
import { Button } from '../components/ui/Button.tsx'
import { CustomerSearch } from '../components/customer/CustomerSearch.tsx'
import { useAsync } from '../components/ui/useAsync.ts'
import { listLeads } from '../data/leads.ts'
import { listJobs } from '../data/jobs.ts'
import { LoadingLine } from '../components/ui/LoadingLine.tsx'

// Minimal front-desk landing page: customer search and at-a-glance open lead/job
// counts, with a link into the full Command Center dashboard.
export function HomePage() {
  const navigate = useNavigate()
  const { data: leads, loading: leadsLoading } = useAsync(() => listLeads(), [])
  const { data: jobs, loading: jobsLoading } = useAsync(() => listJobs(), [])

  const openLeadCount = leads?.filter((l) => l.status !== 'booked' && l.status !== 'lost').length ?? 0
  const openJobCount = jobs?.filter((j) => j.status !== 'completed' && j.status !== 'lost').length ?? 0

  return (
    <div>
      <PageHeader
        eyebrow="ElitePro OS"
        title="Front desk"
        actions={
          <Button type="button" onClick={() => navigate('/leads/new')}>
            New lead
          </Button>
        }
      />
      <div className="container page stack-lg">
        <Section title="Find a customer">
          <CustomerSearch />
        </Section>

        <div className="row-between">
          <Link to="/command-center" className="link-plain text-body-md">
            Command Center →
          </Link>
        </div>

        <Section title="At a glance">
          {leadsLoading || jobsLoading ? (
            <LoadingLine />
          ) : (
            <div className="grid-2">
              <Link to="/leads" className="tile" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="text-display-md">{openLeadCount}</div>
                <div className="text-body-sm text-mute">Open leads</div>
              </Link>
              <Link to="/jobs" className="tile" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="text-display-md">{openJobCount}</div>
                <div className="text-body-sm text-mute">Open jobs</div>
              </Link>
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}
