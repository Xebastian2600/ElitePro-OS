// Shared contract types for the core CRM tables. Every workstream reads/writes
// through these shapes — keep them in sync with supabase/migrations/20260921000000_core_crm.sql.

export type EntityType = 'customer' | 'vehicle' | 'lead' | 'job'

export type AdasStatus = 'unknown' | 'required' | 'not_required'
export type VerifiedStatus = 'unverified' | 'verified'
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'quoted' | 'follow_up' | 'booked' | 'lost'
export type JobStatus =
  | 'new'
  | 'quoted'
  | 'booked'
  | 'parts_needed'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'follow_up'
  | 'lost'

export interface StatusOption<T extends string> {
  value: T
  label: string
}

export const LEAD_STATUSES: StatusOption<LeadStatus>[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'booked', label: 'Booked' },
  { value: 'lost', label: 'Lost' },
]

export const JOB_STATUSES: StatusOption<JobStatus>[] = [
  { value: 'new', label: 'New' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'booked', label: 'Booked' },
  { value: 'parts_needed', label: 'Parts Needed' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'lost', label: 'Lost' },
]

export const ADAS_STATUSES: StatusOption<AdasStatus>[] = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'required', label: 'Required' },
  { value: 'not_required', label: 'Not required' },
]

export const VERIFIED_STATUSES: StatusOption<VerifiedStatus>[] = [
  { value: 'unverified', label: 'Unverified' },
  { value: 'verified', label: 'Verified' },
]

export const OPEN_LEAD_STATUSES: LeadStatus[] = LEAD_STATUSES.map((s) => s.value).filter(
  (status): status is LeadStatus => status !== 'booked' && status !== 'lost',
)

export interface Customer {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CustomerInput {
  name: string
  phone?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
}

export interface Vehicle {
  id: string
  customer_id: string
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
  vin: string | null
  glass_type: string | null
  adas_status: AdasStatus
  verified_status: VerifiedStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface VehicleInput {
  customer_id: string
  year?: number | null
  make?: string | null
  model?: string | null
  trim?: string | null
  vin?: string | null
  glass_type?: string | null
  adas_status?: AdasStatus
  verified_status?: VerifiedStatus
  notes?: string | null
}

export interface Lead {
  id: string
  customer_id: string | null
  vehicle_id: string | null
  source: string | null
  request: string | null
  status: LeadStatus
  assigned_user_id: string | null
  next_action: string | null
  next_action_at: string | null
  lost_reason: string | null
  created_at: string
  updated_at: string
}

export interface LeadInput {
  customer_id?: string | null
  vehicle_id?: string | null
  source?: string | null
  request?: string | null
  status?: LeadStatus
  assigned_user_id?: string | null
  next_action?: string | null
  next_action_at?: string | null
  lost_reason?: string | null
}

export interface Job {
  id: string
  quote_id: string | null
  customer_id: string
  vehicle_id: string
  status: JobStatus
  appointment_at: string | null
  address: string | null
  technician_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface JobInput {
  customer_id: string
  vehicle_id: string
  quote_id?: string | null
  status?: JobStatus
  appointment_at?: string | null
  address?: string | null
  technician_id?: string | null
  notes?: string | null
}

export interface Activity {
  id: string
  entity_type: EntityType
  entity_id: string
  actor_id: string | null
  action: string
  metadata: Record<string, unknown>
  created_at: string
}

// Joined shapes returned by src/data/*.ts read helpers.
export interface CustomerRef {
  id: string
  name: string
  phone: string | null
  email: string | null
}

export interface VehicleRef {
  id: string
  year: number | null
  make: string | null
  model: string | null
  vin: string | null
}

export interface LeadWithRefs extends Lead {
  customer: CustomerRef | null
  vehicle: VehicleRef | null
}

export interface JobWithRefs extends Job {
  customer: CustomerRef | null
  vehicle: VehicleRef | null
}

export interface VehicleWithCustomer extends Vehicle {
  customer: Pick<CustomerRef, 'id' | 'name' | 'phone'> | null
}
