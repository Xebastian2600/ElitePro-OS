import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getLead, updateLead, updateLeadStatus } from '../data/leads.ts'
import { getCustomer } from '../data/customers.ts'
import { getVehicle } from '../data/vehicles.ts'
import type { Customer, Vehicle } from '../shared/types.ts'
import { ValidationError } from '../data/errors.ts'
import { useAuth } from '../lib/auth.tsx'
import { useAsync } from '../components/ui/useAsync.ts'
import { PageHeader } from '../components/ui/PageHeader.tsx'
import { Section } from '../components/ui/Section.tsx'
import { LoadingLine } from '../components/ui/LoadingLine.tsx'
import { EmptyState } from '../components/ui/EmptyState.tsx'
import { TextField } from '../components/ui/TextField.tsx'
import { TextArea } from '../components/ui/TextArea.tsx'
import { SelectField } from '../components/ui/SelectField.tsx'
import { Checkbox } from '../components/ui/Checkbox.tsx'
import { Button } from '../components/ui/Button.tsx'
import { FormError } from '../components/ui/FormError.tsx'
import { StatusBadge, statusTone } from '../components/ui/StatusBadge.tsx'
import { LEAD_STATUSES } from '../shared/types.ts'
import { CustomerCard } from '../components/customer/CustomerCard.tsx'
import { VehicleCard } from '../components/vehicle/VehicleCard.tsx'
import { LeadStatusControl } from '../components/lead/LeadStatusControl.tsx'
import { JobForm } from '../components/job/JobForm.tsx'
import { ActivityList } from '../components/activity/ActivityList.tsx'

const SOURCE_OPTIONS = ['Phone', 'Web form', 'Walk-in', 'Referral', 'Insurance', 'Repeat customer', 'Other']

function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toIsoOrNull(datetimeLocal: string): string | null {
  if (!datetimeLocal) return null
  const date = new Date(datetimeLocal)
  return isNaN(date.getTime()) ? datetimeLocal : date.toISOString()
}

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const leadId = id!
  const navigate = useNavigate()
  const { user } = useAuth()

  const [refreshKey, setRefreshKey] = useState(0)
  const { data: lead, loading, error } = useAsync(() => getLead(leadId), [leadId, refreshKey])

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)

  useEffect(() => {
    if (lead?.customer_id) getCustomer(lead.customer_id).then(setCustomer)
    else setCustomer(null)
  }, [lead?.customer_id])

  useEffect(() => {
    if (lead?.vehicle_id) getVehicle(lead.vehicle_id).then(setVehicle)
    else setVehicle(null)
  }, [lead?.vehicle_id])

  // Editable fields
  const [editing, setEditing] = useState(false)
  const [source, setSource] = useState('')
  const [request, setRequest] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [nextActionAt, setNextActionAt] = useState('')
  const [assignToMe, setAssignToMe] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!lead) return
    setSource(lead.source ?? '')
    setRequest(lead.request ?? '')
    setNextAction(lead.next_action ?? '')
    setNextActionAt(isoToLocalInput(lead.next_action_at))
    setAssignToMe(lead.assigned_user_id === user?.id)
  }, [lead, user?.id])

  const bumpRefresh = () => setRefreshKey((n) => n + 1)

  const handleSaveDetails = async () => {
    if (!lead) return
    setSubmitting(true)
    setErrors({})
    try {
      // Send only edited fields: status has its own control, and a lead assigned
      // to another CSR must stay assigned unless "Assign to me" was toggled.
      const wasAssignedToMe = lead.assigned_user_id === user?.id
      await updateLead(lead.id, {
        source,
        request,
        next_action: nextAction,
        next_action_at: toIsoOrNull(nextActionAt),
        ...(assignToMe !== wasAssignedToMe && { assigned_user_id: assignToMe ? (user?.id ?? null) : null }),
      })
      setEditing(false)
      bumpRefresh()
    } catch (err) {
      if (err instanceof ValidationError) setErrors(err.errors)
      else setErrors({ _: 'Could not save changes. Try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="container page">
        <LoadingLine label="Loading lead…" />
      </div>
    )
  }

  if (error || !lead) {
    return (
      <div className="container page">
        <EmptyState message="Lead not found." />
      </div>
    )
  }

  const statusLabel = LEAD_STATUSES.find((s) => s.value === lead.status)?.label ?? lead.status

  return (
    <div>
      <PageHeader
        eyebrow="Lead"
        title={lead.customer?.name ?? 'Lead'}
        actions={<StatusBadge label={statusLabel} tone={statusTone(lead.status)} onDark />}
      />
      <div className="container page stack-lg">
        <Section title="Customer & vehicle">
          <div className="grid-2">
            {customer ? <CustomerCard customer={customer} compact /> : <LoadingLine label="Loading customer…" />}
            {vehicle ? (
              <VehicleCard vehicle={vehicle} compact />
            ) : (
              <EmptyState message="No vehicle attached to this lead yet." />
            )}
          </div>
        </Section>

        <Section title="Status">
          <LeadStatusControl lead={lead} onChanged={bumpRefresh} />
        </Section>

        <Section
          title="Details"
          actions={
            !editing ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : undefined
          }
        >
          {editing ? (
            <div className="stack">
              <FormError message={errors._} />
              <div className="grid-2">
                <SelectField
                  label="Source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  options={SOURCE_OPTIONS.map((s) => ({ value: s, label: s }))}
                  placeholder="Select a source"
                  error={errors.source}
                />
                <Checkbox label="Assign to me" checked={assignToMe} onChange={(e) => setAssignToMe(e.target.checked)} />
              </div>
              <TextArea label="Request" value={request} onChange={(e) => setRequest(e.target.value)} error={errors.request} />
              <div className="grid-2">
                <TextField label="Next action" value={nextAction} onChange={(e) => setNextAction(e.target.value)} error={errors.next_action} />
                <TextField
                  label="Next action at"
                  type="datetime-local"
                  value={nextActionAt}
                  onChange={(e) => setNextActionAt(e.target.value)}
                  error={errors.next_action_at}
                />
              </div>
              <div className="row">
                <Button type="button" onClick={handleSaveDetails} disabled={submitting}>
                  {submitting ? 'Saving…' : 'Save changes'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="stack-sm">
              <div className="text-body-sm">Source: {lead.source ?? '—'}</div>
              <div className="text-body-sm">Request: {lead.request ?? '—'}</div>
              <div className="text-body-sm">
                Next action: {lead.next_action ?? '—'}
                {lead.next_action_at ? ` — ${new Date(lead.next_action_at).toLocaleString()}` : ''}
              </div>
              <div className="text-body-sm">Assigned: {lead.assigned_user_id === user?.id ? 'You' : lead.assigned_user_id ? 'Team member' : 'Unassigned'}</div>
            </div>
          )}
        </Section>

        <Section title="Create job from quote">
          {lead.vehicle_id && customer ? (
            <JobForm
              customerId={lead.customer_id!}
              vehicleId={lead.vehicle_id}
              defaultAddress={customer.address}
              onCreated={async (job) => {
                await updateLeadStatus(lead.id, 'booked')
                navigate(`/jobs/${job.id}`)
              }}
            />
          ) : (
            <EmptyState
              message="This lead needs a vehicle before you can create a job."
              action={
                lead.customer_id ? (
                  <Link to={`/customers/${lead.customer_id}`} className="btn btn-outline btn-sm">
                    Attach a vehicle
                  </Link>
                ) : undefined
              }
            />
          )}
        </Section>

        <Section title="Activity">
          <ActivityList entityType="lead" entityId={leadId} refreshKey={refreshKey} />
        </Section>
      </div>
    </div>
  )
}
