import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getLead } from '../data/leads.ts'
import { getCustomer } from '../data/customers.ts'
import { getVehicle, listVehiclesForCustomer } from '../data/vehicles.ts'
import { createQuote } from '../data/quotes.ts'
import type { Customer, Vehicle } from '../shared/types.ts'
import { ValidationError } from '../data/errors.ts'
import { useAsync } from '../components/ui/useAsync.ts'
import { PageHeader } from '../components/ui/PageHeader.tsx'
import { Section } from '../components/ui/Section.tsx'
import { LoadingLine } from '../components/ui/LoadingLine.tsx'
import { EmptyState } from '../components/ui/EmptyState.tsx'
import { TextArea } from '../components/ui/TextArea.tsx'
import { Button } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { CustomerCard } from '../components/customer/CustomerCard.tsx'
import { CustomerSearch } from '../components/customer/CustomerSearch.tsx'
import { VehicleCard } from '../components/vehicle/VehicleCard.tsx'

export function QuoteNewPage() {
  const [searchParams] = useSearchParams()
  const leadId = searchParams.get('lead')
  const customerIdParam = searchParams.get('customer')
  const vehicleIdParam = searchParams.get('vehicle')
  const navigate = useNavigate()

  const { data: lead, loading: leadLoading } = useAsync(
    () => (leadId ? getLead(leadId) : Promise.resolve(null)),
    [leadId],
  )

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null)
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // Lead-driven mode: pull the lead's customer/vehicle in.
  useEffect(() => {
    if (!leadId || !lead) return
    if (lead.customer_id) getCustomer(lead.customer_id).then(setCustomer)
    if (lead.vehicle_id) getVehicle(lead.vehicle_id).then(setVehicle)
  }, [leadId, lead])

  // Direct customer param, no lead.
  useEffect(() => {
    if (leadId || !customerIdParam) return
    getCustomer(customerIdParam).then(setCustomer)
  }, [leadId, customerIdParam])

  // Once we have a customer (and no lead), load their vehicles for selection.
  useEffect(() => {
    if (leadId || !customer) return
    listVehiclesForCustomer(customer.id).then((list) => {
      setVehicles(list)
      if (vehicleIdParam) {
        const match = list.find((v) => v.id === vehicleIdParam)
        if (match) setVehicle(match)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, customer?.id])

  const handleCreate = async () => {
    if (!customer || !vehicle) return
    setSubmitting(true)
    setErrors({})
    try {
      const quote = await createQuote({
        customer_id: customer.id,
        vehicle_id: vehicle.id,
        lead_id: leadId ?? null,
        notes: notes || null,
      })
      navigate(`/quotes/${quote.id}`)
    } catch (err) {
      if (err instanceof ValidationError) setErrors(err.errors)
      else setErrors({ _: 'Could not create this quote. Try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  if (leadId && leadLoading) {
    return (
      <div className="container page">
        <LoadingLine label="Loading lead…" />
      </div>
    )
  }

  if (leadId && lead && (!lead.customer_id || !lead.vehicle_id)) {
    return (
      <div>
        <PageHeader title="New quote" />
        <div className="container page">
          <EmptyState
            message="This lead needs a vehicle before you can create a quote."
            action={
              <Link to={`/leads/${leadId}`} className="btn btn-outline btn-sm">
                Attach a vehicle
              </Link>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="New quote" />
      <div className="container page stack-lg">
        <FormError message={errors._} />

        {!leadId && !customer ? (
          <Section title="Customer">
            <CustomerSearch onSelect={setCustomer} />
          </Section>
        ) : null}

        {customer ? (
          <Section title="Customer">
            <CustomerCard
              customer={customer}
              compact
              actions={
                !leadId ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCustomer(null)
                      setVehicle(null)
                      setVehicles(null)
                    }}
                  >
                    Change
                  </Button>
                ) : undefined
              }
            />
          </Section>
        ) : null}

        {customer && !leadId && !vehicle ? (
          <Section title="Vehicle">
            {vehicles === null ? (
              <LoadingLine label="Loading vehicles…" />
            ) : vehicles.length === 0 ? (
              <EmptyState
                message="This customer has no vehicles on file yet."
                action={
                  <Link to={`/customers/${customer.id}`} className="btn btn-outline btn-sm">
                    Add a vehicle
                  </Link>
                }
              />
            ) : (
              <div className="table-stack">
                {vehicles.map((v) => (
                  <VehicleCard
                    key={v.id}
                    vehicle={v}
                    compact
                    actions={
                      <Button type="button" variant="outline" size="sm" onClick={() => setVehicle(v)}>
                        Select
                      </Button>
                    }
                  />
                ))}
              </div>
            )}
          </Section>
        ) : null}

        {vehicle ? (
          <Section title="Vehicle">
            <VehicleCard
              vehicle={vehicle}
              compact
              actions={
                !leadId ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setVehicle(null)}>
                    Change
                  </Button>
                ) : undefined
              }
            />
          </Section>
        ) : null}

        {customer && vehicle ? (
          <Section title="Notes">
            <TextArea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} error={errors.notes} />
            <div style={{ marginTop: 'var(--space-md)' }}>
              <Button type="button" className="btn-cta" onClick={handleCreate} disabled={submitting}>
                {submitting ? 'Creating quote…' : 'Create quote'}
              </Button>
            </div>
          </Section>
        ) : null}
      </div>
    </div>
  )
}
