import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCommandCenterMetrics, listTodayBoard } from '../data/metrics.ts'
import { listTeamMembers } from '../data/team.ts'
import { sortQueue } from '../followup/due.ts'
import type { MetricPeriod } from '../followup/types.ts'
import { useAsync } from '../components/ui/useAsync.ts'
import { PageHeader } from '../components/ui/PageHeader.tsx'
import { Section } from '../components/ui/Section.tsx'
import { Button } from '../components/ui/Button.tsx'
import { FilterPills } from '../components/ui/FilterPills.tsx'
import { LoadingLine } from '../components/ui/LoadingLine.tsx'
import { EmptyState } from '../components/ui/EmptyState.tsx'
import { KpiCard } from '../components/metrics/KpiCard.tsx'
import { FollowUpRow } from '../components/followup/FollowUpRow.tsx'
import { ActivityFeed } from '../components/activity/ActivityFeed.tsx'
import { LeadCard } from '../components/lead/LeadCard.tsx'
import { JobCard } from '../components/job/JobCard.tsx'
import { QuoteList } from '../components/quote/QuoteList.tsx'

const PERIOD_OPTIONS: { value: MetricPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
]

// Board lists are capped at 20 by the data layer; the page shows the first
// few and links to the full view so it stays scannable.
function MoreLink({ shown, total, to }: { shown: number; total: number; to: string }) {
  if (total <= shown) return null
  return (
    <Link to={to} className="link-plain text-body-sm">
      View all{total >= 20 ? '' : ` ${total}`} →
    </Link>
  )
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function CommandCenterPage() {
  const [period, setPeriod] = useState<MetricPeriod>('today')

  const {
    data: metrics,
    loading: metricsLoading,
    error: metricsError,
    reload: reloadMetrics,
  } = useAsync(() => getCommandCenterMetrics(period), [period])

  const {
    data: board,
    loading: boardLoading,
    error: boardError,
    reload: reloadBoard,
  } = useAsync(() => listTodayBoard(), [])

  const { data: teamMembers } = useAsync(() => listTeamMembers(), [])

  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  useEffect(() => {
    if (!metricsLoading && !boardLoading && !metricsError && !boardError) setUpdatedAt(new Date())
  }, [metrics, board, metricsLoading, boardLoading, metricsError, boardError])

  const [activityKey, setActivityKey] = useState(0)
  const refreshAll = useCallback(() => {
    reloadMetrics()
    reloadBoard()
    setActivityKey((n) => n + 1)
  }, [reloadMetrics, reloadBoard])

  useEffect(() => {
    function onFocus() {
      refreshAll()
    }
    window.addEventListener('focus', onFocus)
    const interval = setInterval(refreshAll, 60000)
    return () => {
      window.removeEventListener('focus', onFocus)
      clearInterval(interval)
    }
  }, [refreshAll])

  const followUpsDue = board ? sortQueue(board.followUpsDue, new Date()) : []
  const BOARD_LIMIT = 5
  const conversionLabel = metrics && metrics.conversion_rate != null ? `${Math.round(metrics.conversion_rate * 100)}%` : '—'

  return (
    <div>
      <PageHeader
        eyebrow="ElitePro OS"
        title="Command Center"
        actions={
          <div className="row" style={{ alignItems: 'center' }}>
            <Button type="button" variant="outline" size="sm" onClick={refreshAll}>
              Refresh
            </Button>
            <span className="text-caption" style={{ color: 'var(--color-on-dark-mute)' }} role="status">
              {updatedAt ? `Updated ${formatTime(updatedAt)}` : 'Updating…'}
            </span>
          </div>
        }
      />
      <div className="container page stack-lg">
        <Section title="Metrics">
          <div className="stack">
            <FilterPills
              aria-label="Metric period"
              options={PERIOD_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={period}
              onChange={(value) => setPeriod(value as MetricPeriod)}
            />

            {metricsLoading ? <LoadingLine label="Loading metrics…" /> : null}
            {metricsError ? <div className="text-error text-body-sm">Could not load metrics.</div> : null}

            {metrics && !metricsLoading && !metricsError ? (
              <div className="grid-kpi">
                <KpiCard label="Leads" value={metrics.leads_created} to="/leads" />
                <KpiCard label="Quotes" value={metrics.quotes_created} sublabel={`${metrics.quotes_open} open`} to="/quotes" />
                <KpiCard label="Booked" value={metrics.leads_booked} to="/leads" />
                <KpiCard
                  label="Conversion"
                  value={conversionLabel}
                  sublabel="leads created in period now booked"
                />
                <KpiCard
                  label="Overdue follow-ups"
                  value={metrics.follow_ups_overdue}
                  tone={metrics.follow_ups_overdue > 0 ? 'error' : 'neutral'}
                  sublabel={`${metrics.follow_ups_due_today} due today · ${metrics.follow_ups_open} open`}
                  to="/follow-ups"
                />
                <KpiCard label="Jobs scheduled" value={metrics.jobs_scheduled} to="/jobs" />
                <KpiCard label="Jobs completed" value={metrics.jobs_completed} to="/jobs" />
                <KpiCard label="Open leads" value={metrics.leads_open} to="/leads" />
                <KpiCard label="Lost" value={metrics.leads_lost} to="/leads" />
              </div>
            ) : null}
          </div>
        </Section>

        <Section title="Today">
          {boardLoading ? <LoadingLine label="Loading today's board…" /> : null}
          {boardError ? <div className="text-error text-body-sm">Could not load today's board.</div> : null}

          {board && !boardLoading && !boardError ? (
            <div className="stack-lg">
              <div>
                <h3 className="text-heading-sm" style={{ marginBottom: 'var(--space-sm)' }}>
                  Follow-ups due
                </h3>
                {followUpsDue.length > 0 ? (
                  <div className="stack-sm">
                    {followUpsDue.slice(0, BOARD_LIMIT).map((followUp) => (
                      <FollowUpRow key={followUp.id} followUp={followUp} teamMembers={teamMembers ?? []} onChanged={refreshAll} />
                    ))}
                    <MoreLink shown={BOARD_LIMIT} total={followUpsDue.length} to="/follow-ups" />
                  </div>
                ) : (
                  <EmptyState message="No follow-ups due right now." />
                )}
              </div>

              <div>
                <h3 className="text-heading-sm" style={{ marginBottom: 'var(--space-sm)' }}>
                  Today's leads
                </h3>
                {board.leadsToday.length > 0 ? (
                  <div className="table-stack">
                    {board.leadsToday.slice(0, BOARD_LIMIT).map((lead) => (
                      <LeadCard key={lead.id} lead={lead} />
                    ))}
                    <MoreLink shown={BOARD_LIMIT} total={board.leadsToday.length} to="/leads" />
                  </div>
                ) : (
                  <EmptyState
                    message="No leads created today."
                    action={
                      <Link to="/leads/new" className="btn btn-outline btn-sm">
                        New lead
                      </Link>
                    }
                  />
                )}
              </div>

              <div>
                <h3 className="text-heading-sm" style={{ marginBottom: 'var(--space-sm)' }}>
                  Open quotes
                </h3>
                <QuoteList quotes={board.quotesOpen.slice(0, BOARD_LIMIT)} emptyMessage="No open quotes." />
                <MoreLink shown={BOARD_LIMIT} total={board.quotesOpen.length} to="/quotes" />
              </div>

              <div>
                <h3 className="text-heading-sm" style={{ marginBottom: 'var(--space-sm)' }}>
                  Appointments today
                </h3>
                {board.jobsToday.length > 0 ? (
                  <div className="table-stack">
                    {board.jobsToday.slice(0, BOARD_LIMIT).map((job) => (
                      <JobCard key={job.id} job={job} />
                    ))}
                    <MoreLink shown={BOARD_LIMIT} total={board.jobsToday.length} to="/jobs" />
                  </div>
                ) : (
                  <EmptyState message="No appointments today." />
                )}
              </div>
            </div>
          ) : null}
        </Section>

        <Section
          title="Recent activity"
          actions={
            <Link to="/activity" className="link-plain">
              View all
            </Link>
          }
        >
          <ActivityFeed limit={15} refreshKey={activityKey} teamMembers={teamMembers ?? []} />
        </Section>
      </div>
    </div>
  )
}
