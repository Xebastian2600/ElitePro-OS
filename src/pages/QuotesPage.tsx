import { useState } from 'react'
import { Link } from 'react-router-dom'
import { listQuotes } from '../data/quotes.ts'
import type { QuoteStatus } from '../quote/types.ts'
import { QUOTE_STATUSES } from '../quote/types.ts'
import { useAsync } from '../components/ui/useAsync.ts'
import { PageHeader } from '../components/ui/PageHeader.tsx'
import { FilterPills } from '../components/ui/FilterPills.tsx'
import { LoadingLine } from '../components/ui/LoadingLine.tsx'
import { QuoteList } from '../components/quote/QuoteList.tsx'

export function QuotesPage() {
  const [filter, setFilter] = useState<QuoteStatus | 'all'>('all')
  const { data: quotes, loading, error } = useAsync(
    () => listQuotes(filter === 'all' ? {} : { status: filter }),
    [filter],
  )

  return (
    <div>
      <PageHeader
        title="Quotes"
        actions={
          <Link to="/quotes/new" className="btn btn-secondary">
            New quote
          </Link>
        }
      />
      <div className="container page stack-lg">
        <FilterPills
          aria-label="Filter quotes by status"
          value={filter}
          onChange={setFilter}
          options={[{ value: 'all', label: 'All' }, ...QUOTE_STATUSES.map((s) => ({ value: s.value, label: s.label }))]}
        />
        {loading ? <LoadingLine label="Loading quotes…" /> : null}
        {error ? <div className="text-error text-body-sm">Could not load quotes.</div> : null}
        {!loading && !error ? <QuoteList quotes={quotes ?? []} emptyMessage="No quotes with this status." /> : null}
      </div>
    </div>
  )
}
