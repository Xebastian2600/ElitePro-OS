import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  listIntegrations,
  parseCsv,
  buildLeadImportPreview,
  importLeads,
  type LeadImportPreview,
  type LeadImportResult,
} from '../integrations/index.ts'
import type { IntegrationStatus } from '../integrations/types.ts'
import { findCustomerMatches, createCustomer } from '../data/customers.ts'
import { createLead } from '../data/leads.ts'
import { listIntegrationEvents, logIntegrationEvent, type IntegrationEvent } from '../data/integrationEvents.ts'
import { useAsync } from '../components/ui/useAsync.ts'
import { useDebouncedValue } from '../components/ui/useDebouncedValue.ts'
import { PageHeader } from '../components/ui/PageHeader.tsx'
import { Section } from '../components/ui/Section.tsx'
import { TextArea } from '../components/ui/TextArea.tsx'
import { Button } from '../components/ui/Button.tsx'
import { LoadingLine } from '../components/ui/LoadingLine.tsx'
import { EmptyState } from '../components/ui/EmptyState.tsx'
import { StatusBadge, type StatusTone } from '../components/ui/StatusBadge.tsx'
import { FormError } from '../components/ui/FormError.tsx'

function integrationStatusLabel(status: IntegrationStatus): string {
  switch (status) {
    case 'not_configured':
      return 'Not connected'
    case 'configured':
      return 'Connected'
    case 'error':
      return 'Error'
  }
}

function integrationStatusTone(status: IntegrationStatus): StatusTone {
  switch (status) {
    case 'not_configured':
      return 'neutral'
    case 'configured':
      return 'success'
    case 'error':
      return 'error'
  }
}

function eventEntityHref(event: IntegrationEvent): string | null {
  if (!event.entity_type || !event.entity_id) return null
  switch (event.entity_type) {
    case 'lead':
      return `/leads/${event.entity_id}`
    case 'quote':
      return `/quotes/${event.entity_id}`
    case 'job':
      return `/jobs/${event.entity_id}`
    case 'customer':
      return `/customers/${event.entity_id}`
    default:
      return null
  }
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function IntegrationsPage() {
  const adapters = listIntegrations()

  const [csvText, setCsvText] = useState('')
  const debouncedCsv = useDebouncedValue(csvText, 250)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { preview, parseError } = useMemo<{ preview: LeadImportPreview | null; parseError: string | null }>(() => {
    const trimmed = debouncedCsv.trim()
    if (!trimmed) return { preview: null, parseError: null }
    try {
      const rows = parseCsv(debouncedCsv)
      return { preview: buildLeadImportPreview(rows), parseError: null }
    } catch (err) {
      return { preview: null, parseError: err instanceof Error ? err.message : 'Could not parse this CSV.' }
    }
  }, [debouncedCsv])

  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<LeadImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const { data: events, loading: eventsLoading, error: eventsError, reload: reloadEvents } = useAsync(
    () => listIntegrationEvents({ limit: 50 }),
    [],
  )

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setCsvText(String(reader.result ?? ''))
      setImportResult(null)
      setImportError(null)
    }
    reader.readAsText(file)
  }

  function handleTextChange(value: string) {
    setCsvText(value)
    setImportResult(null)
    setImportError(null)
  }

  const validRowCount = preview ? preview.rows.filter((r) => r.event != null).length : 0
  const canImport = !!preview && preview.missingRequired.length === 0 && validRowCount > 0

  async function handleImport() {
    if (!preview) return
    setImporting(true)
    setImportError(null)
    try {
      const result = await importLeads(preview, { findCustomerMatches, createCustomer, createLead, logIntegrationEvent })
      setImportResult(result)
      reloadEvents()
    } catch {
      setImportError('Could not import this file. Try again.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div>
      <PageHeader eyebrow="ElitePro OS" title="Integrations" />
      <div className="container page stack-lg">
        <Section title="Adapters">
          <div className="grid-2">
            {adapters.map((adapter) => (
              <div key={adapter.id} className="card-soft stack-sm">
                <div className="row-between">
                  <div className="text-heading-sm">{adapter.name}</div>
                  <StatusBadge label={integrationStatusLabel(adapter.status())} tone={integrationStatusTone(adapter.status())} />
                </div>
                <div className="text-body-sm text-mute">{adapter.description}</div>
                <div className="text-caption">Capabilities: {adapter.capabilities.join(', ')}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Import leads from CSV">
          <div className="stack">
            <div className="field">
              <label className="field-label" htmlFor="csv-file-input">
                Upload a CSV file
              </label>
              <input id="csv-file-input" ref={fileInputRef} type="file" accept=".csv" onChange={handleFile} />
            </div>
            <TextArea
              label="Or paste CSV text"
              value={csvText}
              onChange={(e) => handleTextChange(e.target.value)}
              rows={8}
              placeholder="name,phone,email,address,source,request&#10;Jane Doe,555-0100,jane@example.com,,Web form,Windshield crack"
            />
            {parseError ? <FormError message={parseError} /> : null}

            {preview ? (
              <div className="stack-sm">
                <div className="text-body-sm">
                  Columns mapped: {(Object.entries(preview.mapping) as [string, number | null][])
                    .filter(([, idx]) => idx != null)
                    .map(([field, idx]) => `${field} → "${preview.headers[idx as number]}"`)
                    .join(', ') || 'none'}
                </div>

                {preview.missingRequired.length > 0 ? (
                  <FormError
                    message={`Missing required column(s): ${preview.missingRequired.join(', ')}. Provide a name column and either a phone or email column.`}
                  />
                ) : (
                  <>
                    <div className="table-stack">
                      {preview.rows.map((row) => (
                        <div key={row.index} className="table-stack-row">
                          <div className="row-between">
                            <span className="text-body-sm">Row {row.index}</span>
                            {row.errors.length === 0 ? (
                              <StatusBadge label="Valid" tone="success" />
                            ) : (
                              <StatusBadge label="Error" tone="error" />
                            )}
                          </div>
                          {row.event ? (
                            <div className="text-body-sm">
                              {row.event.customer.name} · {row.event.customer.phone ?? '—'} · {row.event.customer.email ?? '—'}
                            </div>
                          ) : null}
                          {row.errors.length > 0 ? (
                            <div className="text-body-sm text-error">{row.errors.join(' ')}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    <div className="text-body-sm">{validRowCount} of {preview.rows.length} rows are valid.</div>

                    <FormError message={importError} />

                    <Button type="button" className="btn-cta" disabled={!canImport || importing} onClick={handleImport}>
                      {importing ? 'Importing…' : `Import ${validRowCount} valid row${validRowCount === 1 ? '' : 's'}`}
                    </Button>
                  </>
                )}
              </div>
            ) : null}

            {importResult ? (
              <div className="notice notice-info stack-sm">
                <div className="text-body-sm">
                  Created {importResult.counts.created_customers} customer(s), reused {importResult.counts.reused_customers}, created{' '}
                  {importResult.counts.leads_created} lead(s), skipped {importResult.counts.skipped}, failed {importResult.counts.failed}.
                </div>
                {importResult.rows.some((r) => r.lead_id) ? (
                  <div className="text-body-sm">
                    New leads:{' '}
                    {importResult.rows
                      .filter((r) => r.lead_id)
                      .map((r, i) => (
                        <span key={r.lead_id}>
                          {i > 0 ? ', ' : ''}
                          <Link to={`/leads/${r.lead_id}`} className="link-plain">
                            Row {r.index}
                          </Link>
                        </span>
                      ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </Section>

        <Section title="Event log">
          {eventsLoading ? <LoadingLine label="Loading events…" /> : null}
          {eventsError ? <div className="text-error text-body-sm">Could not load integration events.</div> : null}
          {!eventsLoading && !eventsError ? (
            events && events.length > 0 ? (
              <div className="table-stack">
                {events.map((event) => {
                  const href = eventEntityHref(event)
                  return (
                    <div key={event.id} className="table-stack-row">
                      <div className="row-between">
                        <span className="text-body-sm">
                          {event.source} · {event.event_type}
                        </span>
                        <StatusBadge
                          label={event.status}
                          tone={event.status === 'failed' ? 'error' : event.status === 'processed' ? 'success' : 'neutral'}
                        />
                      </div>
                      <div className="text-caption">
                        {href ? (
                          <Link to={href} className="link-plain">
                            View {event.entity_type}
                          </Link>
                        ) : null}
                        {href ? ' · ' : ''}
                        {formatTimestamp(event.created_at)}
                      </div>
                      {event.error ? <div className="text-body-sm text-error">{event.error}</div> : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState message="No integration events yet." />
            )
          ) : null}
        </Section>
      </div>
    </div>
  )
}
