import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Customer, Lead, LeadStatus, Vehicle } from '../../shared/types.ts'
import { LEAD_STATUSES } from '../../shared/types.ts'
import { createCustomer, findCustomerMatches, getCustomer } from '../../data/customers.ts'
import { listVehiclesForCustomer } from '../../data/vehicles.ts'
import { createLead, listOpenLeadsForCustomer } from '../../data/leads.ts'
import { DuplicateError, ValidationError } from '../../data/errors.ts'
import { useAuth } from '../../lib/auth.tsx'
import { useDebouncedValue } from '../ui/useDebouncedValue.ts'
import { TextField } from '../ui/TextField.tsx'
import { TextArea } from '../ui/TextArea.tsx'
import { SelectField } from '../ui/SelectField.tsx'
import { Checkbox } from '../ui/Checkbox.tsx'
import { Button } from '../ui/Button.tsx'
import { FormError } from '../ui/FormError.tsx'
import { LoadingLine } from '../ui/LoadingLine.tsx'
import { CustomerMatchNotice } from '../customer/CustomerMatchNotice.tsx'
import { CustomerSearch } from '../customer/CustomerSearch.tsx'
import { CustomerCard } from '../customer/CustomerCard.tsx'
import { VehicleForm } from '../vehicle/VehicleForm.tsx'
import { VehicleCard } from '../vehicle/VehicleCard.tsx'

const SOURCE_OPTIONS = ['Phone', 'Web form', 'Walk-in', 'Referral', 'Insurance', 'Repeat customer', 'Other']

export interface LeadIntakeFormProps {
  initialCustomerId?: string | null
  onCreated: (lead: Lead) => void
}

function toIsoOrNull(datetimeLocal: string): string | null {
  if (!datetimeLocal) return null
  const date = new Date(datetimeLocal)
  return isNaN(date.getTime()) ? datetimeLocal : date.toISOString()
}

export function LeadIntakeForm({ initialCustomerId, onCreated }: LeadIntakeFormProps) {
  const { user } = useAuth()

  // Step 1: customer
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [preselectLoading, setPreselectLoading] = useState(Boolean(initialCustomerId))
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [liveMatches, setLiveMatches] = useState<Customer[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [customerErrors, setCustomerErrors] = useState<Record<string, string>>({})
  const [customerSubmitting, setCustomerSubmitting] = useState(false)

  const debouncedPhone = useDebouncedValue(phone, 250)
  const debouncedEmail = useDebouncedValue(email, 250)

  // Step 2: vehicle
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [vehiclesLoading, setVehiclesLoading] = useState(false)
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('')
  const [showAddVehicle, setShowAddVehicle] = useState(false)

  // Open leads warning
  const [openLeads, setOpenLeads] = useState<Awaited<ReturnType<typeof listOpenLeadsForCustomer>>>([])

  // Step 3: lead
  const [source, setSource] = useState('')
  const [customSource, setCustomSource] = useState('')
  const [request, setRequest] = useState('')
  const [assignToMe, setAssignToMe] = useState(true)
  const [nextAction, setNextAction] = useState('')
  const [nextActionAt, setNextActionAt] = useState('')
  const [status, setStatus] = useState<LeadStatus>('new')
  const [lostReason, setLostReason] = useState('')
  const [leadErrors, setLeadErrors] = useState<Record<string, string>>({})
  const [leadSubmitting, setLeadSubmitting] = useState(false)

  // Preselect customer from ?customerId=
  useEffect(() => {
    if (!initialCustomerId) return
    let active = true
    getCustomer(initialCustomerId)
      .then((customer) => {
        if (active) setSelectedCustomer(customer)
      })
      .finally(() => {
        if (active) setPreselectLoading(false)
      })
    return () => {
      active = false
    }
  }, [initialCustomerId])

  // Live duplicate-check as the CSR types phone/email, before a customer is selected.
  useEffect(() => {
    if (selectedCustomer) return
    const trimmedPhone = debouncedPhone.trim()
    const trimmedEmail = debouncedEmail.trim()
    if (!trimmedPhone && !trimmedEmail) {
      setLiveMatches([])
      return
    }
    let active = true
    findCustomerMatches({ phone: trimmedPhone || null, email: trimmedEmail || null })
      .then((matches) => {
        if (active) setLiveMatches(matches)
      })
      .catch(() => {
        if (active) setLiveMatches([])
      })
    return () => {
      active = false
    }
  }, [debouncedPhone, debouncedEmail, selectedCustomer])

  // Load vehicles + open leads once a customer is selected.
  useEffect(() => {
    if (!selectedCustomer) {
      setVehicles([])
      setOpenLeads([])
      return
    }
    let active = true
    setVehiclesLoading(true)
    listVehiclesForCustomer(selectedCustomer.id)
      .then((list) => {
        if (active) setVehicles(list)
      })
      .finally(() => {
        if (active) setVehiclesLoading(false)
      })
    listOpenLeadsForCustomer(selectedCustomer.id).then((leads) => {
      if (active) setOpenLeads(leads)
    })
    return () => {
      active = false
    }
  }, [selectedCustomer])

  const handleUseExisting = (customer: Customer) => {
    setSelectedCustomer(customer)
    setLiveMatches([])
  }

  const handleChangeCustomer = () => {
    setSelectedCustomer(null)
    setSelectedVehicleId('')
    setVehicles([])
    setOpenLeads([])
    setName('')
    setPhone('')
    setEmail('')
    setLiveMatches([])
  }

  const handleCreateCustomer = async () => {
    setCustomerSubmitting(true)
    setCustomerErrors({})
    try {
      const customer = await createCustomer({ name, phone, email })
      setSelectedCustomer(customer)
    } catch (err) {
      if (err instanceof ValidationError) {
        setCustomerErrors(err.errors)
      } else if (err instanceof DuplicateError && err.existing) {
        setLiveMatches([err.existing as Customer])
      } else {
        setCustomerErrors({ _: 'Could not create this customer. Try again.' })
      }
    } finally {
      setCustomerSubmitting(false)
    }
  }

  const handleSubmitLead = async () => {
    if (!selectedCustomer) return
    setLeadSubmitting(true)
    setLeadErrors({})

    const resolvedSource = source === 'Other' ? customSource : source

    try {
      const lead = await createLead({
        customer_id: selectedCustomer.id,
        vehicle_id: selectedVehicleId || null,
        source: resolvedSource,
        request,
        status,
        assigned_user_id: assignToMe ? (user?.id ?? null) : null,
        next_action: nextAction,
        next_action_at: toIsoOrNull(nextActionAt),
        lost_reason: status === 'lost' ? lostReason : null,
      })
      onCreated(lead)
    } catch (err) {
      if (err instanceof ValidationError) {
        setLeadErrors(err.errors)
      } else {
        setLeadErrors({ _: 'Could not create this lead. Try again.' })
      }
    } finally {
      setLeadSubmitting(false)
    }
  }

  if (preselectLoading) return <LoadingLine label="Loading customer…" />

  return (
    <div className="stack-lg">
      {/* Step 1: customer */}
      <section className="stack">
        <h2 className="text-heading-sm">1. Customer</h2>
        {selectedCustomer ? (
          <CustomerCard
            customer={selectedCustomer}
            compact
            actions={
              <Button type="button" variant="outline" size="sm" onClick={handleChangeCustomer}>
                Change customer
              </Button>
            }
          />
        ) : (
          <div className="stack">
            <FormError message={customerErrors._} />
            {liveMatches.length > 0 ? (
              <CustomerMatchNotice customer={liveMatches[0]} onUse={handleUseExisting} />
            ) : null}
            <div className="grid-2">
              <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={customerErrors.name} />
              <TextField
                label="Phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                error={customerErrors.phone}
                placeholder="(555) 123-4567"
              />
            </div>
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={customerErrors.email}
              placeholder="name@example.com"
            />
            <div className="row">
              <Button type="button" onClick={handleCreateCustomer} disabled={customerSubmitting}>
                {customerSubmitting ? 'Creating…' : 'Create new customer'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowSearch((v) => !v)}>
                {showSearch ? 'Hide search' : 'Search existing customers'}
              </Button>
            </div>
            {showSearch ? <CustomerSearch onSelect={handleUseExisting} /> : null}
          </div>
        )}

        {selectedCustomer && openLeads.length > 0 ? (
          <div className="notice notice-info">
            This customer already has {openLeads.length} open lead{openLeads.length === 1 ? '' : 's'}:{' '}
            {openLeads.map((lead, i) => (
              <span key={lead.id}>
                {i > 0 ? ', ' : ''}
                <Link to={`/leads/${lead.id}`} className="link-plain">
                  {lead.request || lead.status}
                </Link>
              </span>
            ))}
            . You can still continue.
          </div>
        ) : null}
      </section>

      {/* Step 2: vehicle */}
      {selectedCustomer ? (
        <section className="stack">
          <h2 className="text-heading-sm">2. Vehicle (optional)</h2>
          {vehiclesLoading ? <LoadingLine label="Loading vehicles…" /> : null}
          {!vehiclesLoading && vehicles.length > 0 ? (
            <div className="field">
              <label className="field-label" htmlFor="vehicle-select">
                Choose a vehicle
              </label>
              <select
                id="vehicle-select"
                className="select"
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
              >
                <option value="">No vehicle selected</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.vin || 'Vehicle'}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {selectedVehicleId ? (
            <VehicleCard vehicle={vehicles.find((v) => v.id === selectedVehicleId)!} compact />
          ) : null}
          {!showAddVehicle ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAddVehicle(true)}>
              Add new vehicle
            </Button>
          ) : (
            <VehicleForm
              customerId={selectedCustomer.id}
              onSaved={(vehicle) => {
                setVehicles((prev) => [vehicle, ...prev])
                setSelectedVehicleId(vehicle.id)
                setShowAddVehicle(false)
              }}
              onCancel={() => setShowAddVehicle(false)}
            />
          )}
        </section>
      ) : null}

      {/* Step 3: lead */}
      {selectedCustomer ? (
        <section className="stack">
          <h2 className="text-heading-sm">3. Lead details</h2>
          <FormError message={leadErrors._} />
          <div className="grid-2">
            <SelectField
              label="Source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              options={SOURCE_OPTIONS.map((s) => ({ value: s, label: s }))}
              placeholder="Select a source"
              error={leadErrors.source}
            />
            <SelectField
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as LeadStatus)}
              options={LEAD_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
              error={leadErrors.status}
            />
          </div>
          {source === 'Other' ? (
            <TextField label="Describe source" value={customSource} onChange={(e) => setCustomSource(e.target.value)} />
          ) : null}
          {status === 'lost' ? (
            <TextField
              label="Lost reason"
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              error={leadErrors.lost_reason}
              required
            />
          ) : null}
          <TextArea label="Request" value={request} onChange={(e) => setRequest(e.target.value)} error={leadErrors.request} />
          <Checkbox label="Assign to me" checked={assignToMe} onChange={(e) => setAssignToMe(e.target.checked)} />
          <div className="grid-2">
            <TextField label="Next action" value={nextAction} onChange={(e) => setNextAction(e.target.value)} error={leadErrors.next_action} />
            <TextField
              label="Next action at"
              type="datetime-local"
              value={nextActionAt}
              onChange={(e) => setNextActionAt(e.target.value)}
              error={leadErrors.next_action_at}
            />
          </div>
          <Button type="button" onClick={handleSubmitLead} disabled={leadSubmitting}>
            {leadSubmitting ? 'Creating lead…' : 'Create lead'}
          </Button>
        </section>
      ) : null}
    </div>
  )
}
