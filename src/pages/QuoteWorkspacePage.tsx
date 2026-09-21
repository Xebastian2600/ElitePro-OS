import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getQuoteWithItems, recalculateStoredQuote, saveQuote } from '../data/quotes.ts'
import { getCustomer } from '../data/customers.ts'
import { getVehicle } from '../data/vehicles.ts'
import { getLead, updateLeadStatus } from '../data/leads.ts'
import { getPricingConfig } from '../data/pricingRules.ts'
import { createJobFromQuote, findJobByQuoteId } from '../data/jobs.ts'
import type { Customer, Vehicle } from '../shared/types.ts'
import type { Quote, QuoteItem, QuoteItemInput } from '../quote/types.ts'
import { EDITABLE_QUOTE_STATUSES, QUOTE_STATUSES } from '../quote/types.ts'
import { calculateQuote } from '../quote/calculator.ts'
import { getKbClient } from '../kb/client.ts'
import type { KbCategory } from '../kb/types.ts'
import { DuplicateError, ValidationError } from '../data/errors.ts'
import { useAsync } from '../components/ui/useAsync.ts'
import { PageHeader } from '../components/ui/PageHeader.tsx'
import { Section } from '../components/ui/Section.tsx'
import { LoadingLine } from '../components/ui/LoadingLine.tsx'
import { EmptyState } from '../components/ui/EmptyState.tsx'
import { TextArea } from '../components/ui/TextArea.tsx'
import { TextField } from '../components/ui/TextField.tsx'
import { Button } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { StatusBadge, statusTone } from '../components/ui/StatusBadge.tsx'
import { CustomerCard } from '../components/customer/CustomerCard.tsx'
import { VehicleCard } from '../components/vehicle/VehicleCard.tsx'
import { ActivityList } from '../components/activity/ActivityList.tsx'
import { QuoteItemsEditor } from '../components/quote/QuoteItemsEditor.tsx'
import { QuoteBreakdown } from '../components/quote/QuoteBreakdown.tsx'
import { QuoteStatusControl } from '../components/quote/QuoteStatusControl.tsx'
import { QuoteSummary } from '../components/quote/QuoteSummary.tsx'
import { CopilotPanel } from '../components/copilot/CopilotPanel.tsx'
import { KbPanel } from '../components/kb/KbPanel.tsx'
import type { CopilotState } from '../copilot/assess.ts'

function toItemInput(item: QuoteItem): QuoteItemInput {
  return {
    id: item.id,
    type: item.type,
    description: item.description,
    quantity: item.quantity,
    unit_cost: item.unit_cost,
    unit_price: item.unit_price,
    metadata: item.metadata,
  }
}

export function QuoteWorkspacePage() {
  const { id } = useParams<{ id: string }>()
  const quoteId = id!
  const navigate = useNavigate()

  const [refreshKey, setRefreshKey] = useState(0)
  const bumpRefresh = () => setRefreshKey((n) => n + 1)

  const { data: loaded, loading, error } = useAsync(() => getQuoteWithItems(quoteId), [quoteId, refreshKey])
  const quote = loaded?.quote ?? null
  const savedItems = useMemo(() => loaded?.items ?? [], [loaded])

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)

  useEffect(() => {
    if (quote?.customer_id) getCustomer(quote.customer_id).then(setCustomer)
  }, [quote?.customer_id])

  useEffect(() => {
    if (quote?.vehicle_id) getVehicle(quote.vehicle_id).then(setVehicle)
  }, [quote?.vehicle_id])

  const { data: lead } = useAsync(
    () => (quote?.lead_id ? getLead(quote.lead_id) : Promise.resolve(null)),
    [quote?.lead_id],
  )

  const { data: currentPricing } = useAsync(() => getPricingConfig(), [refreshKey])

  const { data: existingJob } = useAsync(
    () => (quote ? findJobByQuoteId(quote.id) : Promise.resolve(null)),
    [quote?.id, refreshKey],
  )

  const kbAvailable = useMemo(() => getKbClient().available, [])

  // Editor state, seeded from the loaded quote/items on each (re)load.
  const [editorItems, setEditorItems] = useState<QuoteItemInput[]>([])
  const [notes, setNotes] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!loaded) return
    setEditorItems(loaded.items.map(toItemInput))
    setNotes(loaded.quote.notes ?? '')
    setDirty(false)
  }, [loaded])

  function updateEditorItems(items: QuoteItemInput[]) {
    setEditorItems(items)
    setDirty(true)
  }

  function updateNotes(value: string) {
    setNotes(value)
    setDirty(true)
  }

  const editable = quote ? EDITABLE_QUOTE_STATUSES.includes(quote.status) : false

  const liveCalculation = useMemo(() => {
    if (!currentPricing) return null
    return calculateQuote(editorItems, currentPricing)
  }, [editorItems, currentPricing])

  const storedCalculation = useMemo(() => {
    if (!quote) return null
    return recalculateStoredQuote(quote, savedItems)
  }, [quote, savedItems])

  const displayCalculation = editable ? liveCalculation : storedCalculation

  // Warn when the CURRENT pricing rules would produce different totals for the
  // stored (saved) items than what's on the quote — the calculator, not this
  // page, owns what "different" means (issues aside, we just compare totals).
  const rulesChanged = useMemo(() => {
    if (!editable || !currentPricing || !quote) return false
    const calcWithCurrentRules = calculateQuote(savedItems.map(toItemInput), currentPricing)
    return calcWithCurrentRules.total !== quote.total
  }, [editable, currentPricing, quote, savedItems])

  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!quote || !currentPricing) return
    setSaving(true)
    setSaveErrors({})
    try {
      await saveQuote(quote.id, { items: editorItems, notes: notes || null }, currentPricing)
      bumpRefresh()
    } catch (err) {
      if (err instanceof ValidationError) setSaveErrors(err.errors)
      else setSaveErrors({ _: 'Could not save this quote. Try again.' })
    } finally {
      setSaving(false)
    }
  }

  // KB panel is driven by this page's own search box, or by a copilot "Look
  // up in KB" click, which sets this context and the panel runs the search.
  const [kbContext, setKbContext] = useState<{ query: string; categories: KbCategory[] } | undefined>(undefined)

  const copilotState: CopilotState = {
    lead: lead ?? null,
    customer,
    vehicle,
    quote: quote ? { status: quote.status } : null,
    items: editorItems,
    calculation: displayCalculation,
    pricing: currentPricing ?? null,
    hasJob: !!existingJob,
    kbAvailable,
  }

  if (loading) {
    return (
      <div className="container page">
        <LoadingLine label="Loading quote…" />
      </div>
    )
  }

  if (error || !quote) {
    return (
      <div className="container page">
        <EmptyState message="Quote not found." />
      </div>
    )
  }

  const statusLabel = QUOTE_STATUSES.find((s) => s.value === quote.status)?.label ?? quote.status

  return (
    <div>
      <PageHeader
        eyebrow="Quote"
        title={customer?.name ?? quote.customer?.name ?? 'Quote'}
        actions={<StatusBadge label={statusLabel} tone={statusTone(quote.status)} onDark />}
      />
      <div className="container page">
        <div className="quote-workspace">
          <div className="stack-lg">
            <Section title="Customer & vehicle">
              <div className="grid-2">
                {customer ? <CustomerCard customer={customer} compact /> : <LoadingLine label="Loading customer…" />}
                {vehicle ? <VehicleCard vehicle={vehicle} compact /> : <LoadingLine label="Loading vehicle…" />}
              </div>
            </Section>

            <Section title="Items">
              <FormError message={saveErrors._} />
              {currentPricing ? (
                <QuoteItemsEditor
                  items={editorItems}
                  onChange={updateEditorItems}
                  pricing={currentPricing}
                  errors={saveErrors}
                  disabled={!editable}
                />
              ) : (
                <LoadingLine label="Loading pricing…" />
              )}
            </Section>

            <Section title="Notes">
              <TextArea label="Internal notes" value={notes} onChange={(e) => updateNotes(e.target.value)} disabled={!editable} />
            </Section>

            <div className="row" style={{ alignItems: 'center' }}>
              <Button type="button" className="btn-cta" onClick={handleSave} disabled={!editable || !dirty || saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              {dirty ? (
                <span className="text-caption" role="status">
                  Unsaved changes
                </span>
              ) : null}
            </div>

            {rulesChanged ? (
              <div className="notice">Pricing rules changed since last save — save to update totals.</div>
            ) : null}

            <Section title="Breakdown">
              {displayCalculation ? <QuoteBreakdown calculation={displayCalculation} /> : <LoadingLine />}
            </Section>

            <Section title="Status">
              {storedCalculation ? (
                <QuoteStatusControl
                  quote={quote}
                  calculation={storedCalculation}
                  onChanged={bumpRefresh}
                  disabled={dirty}
                  disabledReason={dirty ? 'Save changes first.' : undefined}
                />
              ) : (
                <LoadingLine />
              )}
            </Section>

            <Section title="Customer-ready summary">
              {customer && vehicle && displayCalculation ? (
                <QuoteSummary customer={customer} vehicle={vehicle} items={editorItems} calculation={displayCalculation} notes={notes} />
              ) : (
                <LoadingLine />
              )}
            </Section>

            {quote.status === 'approved' ? (
              <Section title="Create job">
                {existingJob ? (
                  <Link to={`/jobs/${existingJob.id}`} className="link-plain">
                    View job
                  </Link>
                ) : customer ? (
                  <CreateJobFromQuoteForm
                    quote={quote}
                    customer={customer}
                    onCreated={async (jobId) => {
                      if (quote.lead_id) await updateLeadStatus(quote.lead_id, 'booked')
                      navigate(`/jobs/${jobId}`)
                    }}
                  />
                ) : (
                  <LoadingLine />
                )}
              </Section>
            ) : null}

            <Section title="Activity">
              <ActivityList entityType="quote" entityId={quoteId} refreshKey={refreshKey} />
            </Section>
          </div>

          <div className="stack-lg">
            <CopilotPanel state={copilotState} onKbLookup={(q) => setKbContext(q)} />
            <KbPanel context={kbContext} vehicle={vehicle} />
          </div>
        </div>
      </div>
    </div>
  )
}

interface CreateJobFromQuoteFormProps {
  quote: Quote
  customer: Customer
  onCreated: (jobId: string) => void
}

function CreateJobFromQuoteForm({ quote, customer, onCreated }: CreateJobFromQuoteFormProps) {
  const [appointmentAt, setAppointmentAt] = useState('')
  const [address, setAddress] = useState(customer.address ?? '')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [duplicateJobId, setDuplicateJobId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setErrors({})
    setDuplicateJobId(null)
    try {
      const job = await createJobFromQuote({
        quote_id: quote.id,
        customer_id: quote.customer_id,
        vehicle_id: quote.vehicle_id,
        appointment_at: appointmentAt ? new Date(appointmentAt).toISOString() : null,
        address,
        notes,
      })
      onCreated(job.id)
    } catch (err) {
      if (err instanceof ValidationError) {
        setErrors(err.errors)
      } else if (err instanceof DuplicateError) {
        if (err.existing) setDuplicateJobId((err.existing as { id: string }).id)
        else setErrors({ [err.field]: err.message })
      } else {
        setErrors({ _: 'Could not create this job. Try again.' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit} noValidate>
      <FormError message={errors._} />
      {duplicateJobId ? (
        <div className="match-notice" role="status">
          <div className="text-body-md">A job for this quote already exists.</div>
          <Link to={`/jobs/${duplicateJobId}`} className="link-plain">
            View existing job
          </Link>
        </div>
      ) : null}
      <TextField
        label="Appointment"
        type="datetime-local"
        value={appointmentAt}
        onChange={(e) => setAppointmentAt(e.target.value)}
        error={errors.appointment_at}
      />
      <TextField label="Address" value={address ?? ''} onChange={(e) => setAddress(e.target.value)} error={errors.address} />
      <TextArea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} error={errors.notes} />
      <Button type="submit" className="btn-cta" disabled={submitting}>
        {submitting ? 'Creating job…' : 'Create job'}
      </Button>
    </form>
  )
}
