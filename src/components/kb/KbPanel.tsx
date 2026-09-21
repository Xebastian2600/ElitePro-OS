import { useEffect, useMemo, useRef, useState } from 'react'
import type { Vehicle } from '../../shared/types.ts'
import type { KbCategory, KbSearchResult } from '../../kb/types.ts'
import { KB_CATEGORIES } from '../../kb/types.ts'
import { getKbClient } from '../../kb/client.ts'
import { TextField } from '../ui/TextField.tsx'
import { Button } from '../ui/Button.tsx'
import { LoadingLine } from '../ui/LoadingLine.tsx'

export interface KbPanelProps {
  context?: { query?: string; categories?: KbCategory[] }
  vehicle?: Vehicle | null
}

function vehicleContext(vehicle?: Vehicle | null): Record<string, string> | undefined {
  if (!vehicle) return undefined
  const entries: [string, string][] = []
  if (vehicle.year !== null) entries.push(['year', String(vehicle.year)])
  if (vehicle.make !== null) entries.push(['make', vehicle.make])
  if (vehicle.model !== null) entries.push(['model', vehicle.model])
  if (vehicle.glass_type !== null) entries.push(['glass_type', vehicle.glass_type])
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

export function KbPanel({ context, vehicle }: KbPanelProps) {
  const client = useMemo(() => getKbClient(), [])
  const [query, setQuery] = useState(context?.query ?? '')
  const [categories, setCategories] = useState<KbCategory[]>(context?.categories ?? [])
  const [result, setResult] = useState<KbSearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  function runSearch(q: string, cats: KbCategory[]) {
    if (!client.available) return
    if (!q.trim()) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)

    client
      .search({ query: q, categories: cats, context: vehicleContext(vehicle) }, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return
        setResult(res)
        setSearched(true)
        setLoading(false)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setError('Could not search the knowledge base. Try again.')
        setLoading(false)
      })
  }

  // Externally driven: when the caller passes a new query/categories (e.g. a
  // copilot "Look up in KB" click), sync local state and run the search.
  const contextKey = context ? `${context.query ?? ''}|${(context.categories ?? []).join(',')}` : ''
  useEffect(() => {
    if (context?.query === undefined) return
    setQuery(context.query)
    setCategories(context.categories ?? [])
    runSearch(context.query, context.categories ?? [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  function toggleCategory(value: KbCategory) {
    setCategories((prev) => (prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]))
  }

  return (
    <div className="card-soft stack">
      <div className="text-heading-sm">Knowledge base</div>

      {!client.available ? (
        <div className="notice">Knowledge base not connected.</div>
      ) : (
        <>
          <TextField
            label="Search the knowledge base"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. 2020 Honda Accord windshield ADAS"
          />
          <div className="pills" role="group" aria-label="Filter by category">
            {KB_CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                className={`pill${categories.includes(cat.value) ? ' active' : ''}`}
                aria-pressed={categories.includes(cat.value)}
                onClick={() => toggleCategory(cat.value)}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => runSearch(query, categories)} disabled={loading}>
            Search
          </Button>

          {loading ? <LoadingLine label="Searching the knowledge base…" /> : null}
          {error ? <div className="text-error text-body-sm">{error}</div> : null}

          {!loading && !error && searched ? (
            <div className="stack-sm">
              {result && result.answer !== null ? (
                <div className="stack-sm">
                  <div className="text-body-sm">{result.answer}</div>
                  <KbSources result={result} />
                </div>
              ) : result && result.sources.length > 0 ? (
                <div className="stack-sm">
                  <div className="text-caption">No direct answer — see sources</div>
                  <KbSources result={result} />
                </div>
              ) : (
                <div className="text-body-sm text-mute">No KB results for this search.</div>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

function KbSources({ result }: { result: KbSearchResult }) {
  return (
    <div className="stack-sm">
      {result.sources.map((source) => (
        <div key={source.id} className="table-stack-row" style={{ cursor: 'default' }}>
          <div className="text-body-sm" style={{ fontWeight: 600 }}>
            {source.url ? (
              <a href={source.url} target="_blank" rel="noreferrer" className="link-plain">
                {source.title}
              </a>
            ) : (
              source.title
            )}
          </div>
          <div className="text-caption">
            {[source.section, source.category, source.updated_at ? new Date(source.updated_at).toLocaleDateString() : null]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      ))}
    </div>
  )
}
