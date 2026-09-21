import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getCustomer } from '../data/customers.ts'
import { listVehiclesForCustomer } from '../data/vehicles.ts'
import { listOpenLeadsForCustomer } from '../data/leads.ts'
import { listJobs } from '../data/jobs.ts'
import type { Vehicle } from '../shared/types.ts'
import { useAsync } from '../components/ui/useAsync.ts'
import { PageHeader } from '../components/ui/PageHeader.tsx'
import { Section } from '../components/ui/Section.tsx'
import { Button } from '../components/ui/Button.tsx'
import { LoadingLine } from '../components/ui/LoadingLine.tsx'
import { EmptyState } from '../components/ui/EmptyState.tsx'
import { CustomerCard } from '../components/customer/CustomerCard.tsx'
import { CustomerForm } from '../components/customer/CustomerForm.tsx'
import { VehicleList } from '../components/vehicle/VehicleList.tsx'
import { VehicleForm } from '../components/vehicle/VehicleForm.tsx'
import { LeadCard } from '../components/lead/LeadCard.tsx'
import { JobCard } from '../components/job/JobCard.tsx'
import { ActivityList } from '../components/activity/ActivityList.tsx'

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const customerId = id!
  const navigate = useNavigate()

  const [editingCustomer, setEditingCustomer] = useState(false)
  const [addingVehicle, setAddingVehicle] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const { data: customer, loading, error, reload } = useAsync(() => getCustomer(customerId), [customerId, refreshKey])
  const { data: vehicles, loading: vehiclesLoading, reload: reloadVehicles } = useAsync(
    () => listVehiclesForCustomer(customerId),
    [customerId, refreshKey],
  )
  const { data: openLeads, loading: leadsLoading } = useAsync(
    () => listOpenLeadsForCustomer(customerId),
    [customerId, refreshKey],
  )
  const { data: allJobs, loading: jobsLoading } = useAsync(() => listJobs(), [refreshKey])
  const jobsForCustomer = allJobs?.filter((job) => job.customer_id === customerId) ?? []

  const bumpRefresh = () => setRefreshKey((n) => n + 1)

  if (loading) {
    return (
      <div className="container page">
        <LoadingLine label="Loading customer…" />
      </div>
    )
  }

  if (error || !customer) {
    return (
      <div className="container page">
        <EmptyState message="Customer not found." />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={customer.name}
        actions={
          <Button type="button" variant="secondary" onClick={() => navigate(`/leads/new?customerId=${customerId}`)}>
            New lead for this customer
          </Button>
        }
      />
      <div className="container page stack-lg">
        <Section
          title="Customer"
          actions={
            !editingCustomer ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingCustomer(true)}>
                Edit
              </Button>
            ) : undefined
          }
        >
          {editingCustomer ? (
            <div className="card">
              <CustomerForm
                initial={customer}
                onSaved={() => {
                  setEditingCustomer(false)
                  reload()
                }}
                onCancel={() => setEditingCustomer(false)}
              />
            </div>
          ) : (
            <CustomerCard customer={customer} />
          )}
        </Section>

        <Section
          title="Vehicles"
          actions={
            !addingVehicle ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setAddingVehicle(true)}>
                Add vehicle
              </Button>
            ) : undefined
          }
        >
          {addingVehicle ? (
            <div className="card" style={{ marginBottom: 'var(--space-md)' }}>
              <VehicleForm
                customerId={customerId}
                onSaved={() => {
                  setAddingVehicle(false)
                  reloadVehicles()
                  bumpRefresh()
                }}
                onCancel={() => setAddingVehicle(false)}
              />
            </div>
          ) : null}
          {editingVehicle ? (
            <div className="card" style={{ marginBottom: 'var(--space-md)' }}>
              <VehicleForm
                customerId={customerId}
                initial={editingVehicle}
                onSaved={() => {
                  setEditingVehicle(null)
                  reloadVehicles()
                  bumpRefresh()
                }}
                onCancel={() => setEditingVehicle(null)}
              />
            </div>
          ) : null}
          {vehiclesLoading ? <LoadingLine /> : <VehicleList vehicles={vehicles ?? []} onEdit={setEditingVehicle} />}
        </Section>

        <Section title="Open leads">
          {leadsLoading ? (
            <LoadingLine />
          ) : openLeads && openLeads.length > 0 ? (
            <div className="table-stack">
              {openLeads.map((lead) => (
                <LeadCard key={lead.id} lead={lead} />
              ))}
            </div>
          ) : (
            <EmptyState
              message="No open leads for this customer."
              action={
                <Link to={`/leads/new?customerId=${customerId}`} className="btn btn-outline btn-sm">
                  New lead for this customer
                </Link>
              }
            />
          )}
        </Section>

        <Section title="Jobs">
          {jobsLoading ? (
            <LoadingLine />
          ) : jobsForCustomer.length > 0 ? (
            <div className="table-stack">
              {jobsForCustomer.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          ) : (
            <EmptyState message="No jobs for this customer yet." />
          )}
        </Section>

        <Section title="Activity">
          <ActivityList entityType="customer" entityId={customerId} refreshKey={refreshKey} />
        </Section>
      </div>
    </div>
  )
}
