import type { QuoteWithRefs } from '../../data/quotes.ts'
import { EmptyState } from '../ui/EmptyState.tsx'
import { QuoteCard } from './QuoteCard.tsx'

export interface QuoteListProps {
  quotes: QuoteWithRefs[]
  emptyMessage?: string
}

export function QuoteList({ quotes, emptyMessage = 'No quotes yet.' }: QuoteListProps) {
  if (quotes.length === 0) return <EmptyState message={emptyMessage} />

  return (
    <div className="table-stack">
      {quotes.map((quote) => (
        <QuoteCard key={quote.id} quote={quote} />
      ))}
    </div>
  )
}
