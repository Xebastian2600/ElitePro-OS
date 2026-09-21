import { supabase } from '../lib/supabase.ts'
import { validateJobInput } from '../shared/validation.ts'
import type { Job, JobInput, JobStatus, JobWithRefs } from '../shared/types.ts'
import { JOB_STATUSES } from '../shared/types.ts'
import { DuplicateError, ValidationError, toDataError } from './errors.ts'
import { unwrap } from './unwrap.ts'

const JOB_WITH_REFS_SELECT = '*, customer:customers(id,name,phone,email), vehicle:vehicles(id,year,make,model,vin)'

export async function listJobs(options: { status?: JobStatus } = {}): Promise<JobWithRefs[]> {
  let query = supabase.from('jobs').select(JOB_WITH_REFS_SELECT).order('updated_at', { ascending: false })
  if (options.status) query = query.eq('status', options.status)
  return unwrap(await query)
}

export async function getJob(id: string): Promise<JobWithRefs> {
  return unwrap(await supabase.from('jobs').select(JOB_WITH_REFS_SELECT).eq('id', id).single())
}

export async function findJobByQuoteId(quoteId: string): Promise<Job | null> {
  const { data, error } = await supabase.from('jobs').select('*').eq('quote_id', quoteId).maybeSingle()
  if (error) throw toDataError(error)
  return data
}

export async function createJob(input: JobInput): Promise<Job> {
  const validated = validateJobInput(input)
  if (!validated.ok) throw new ValidationError(validated.errors)

  if (validated.value.quote_id) {
    const existing = await findJobByQuoteId(validated.value.quote_id)
    if (existing) throw new DuplicateError('quote_id', 'A job for this quote already exists.', existing)
  }

  return unwrap(await supabase.from('jobs').insert(validated.value).select('*').single())
}

export interface CreateJobFromQuoteInput {
  quote_id: string
  customer_id: string
  vehicle_id: string
  appointment_at?: string | null
  address?: string | null
  technician_id?: string | null
  notes?: string | null
}

export async function createJobFromQuote(input: CreateJobFromQuoteInput): Promise<Job> {
  const validated = validateJobInput({ ...input, status: 'booked' })
  if (!validated.ok) throw new ValidationError(validated.errors)
  if (!validated.value.quote_id) throw new ValidationError({ quote_id: 'quote_id is required.' })

  const existing = await findJobByQuoteId(validated.value.quote_id)
  if (existing) throw new DuplicateError('quote_id', 'A job for this quote already exists.', existing)

  return unwrap(await supabase.from('jobs').insert(validated.value).select('*').single())
}

export async function updateJob(id: string, patch: Partial<JobInput>): Promise<Job> {
  const current = await getJob(id)
  const merged: JobInput = {
    customer_id: current.customer_id,
    vehicle_id: current.vehicle_id,
    quote_id: current.quote_id,
    status: current.status,
    appointment_at: current.appointment_at,
    address: current.address,
    technician_id: current.technician_id,
    notes: current.notes,
    ...patch,
  }

  const validated = validateJobInput(merged)
  if (!validated.ok) throw new ValidationError(validated.errors)

  if (validated.value.quote_id && validated.value.quote_id !== current.quote_id) {
    const existing = await findJobByQuoteId(validated.value.quote_id)
    if (existing) throw new DuplicateError('quote_id', 'A job for this quote already exists.', existing)
  }

  return unwrap(await supabase.from('jobs').update(validated.value).eq('id', id).select('*').single())
}

export async function updateJobStatus(id: string, status: JobStatus): Promise<Job> {
  if (!JOB_STATUSES.some((s) => s.value === status)) {
    throw new ValidationError({ status: 'Invalid job status.' })
  }
  return unwrap(await supabase.from('jobs').update({ status }).eq('id', id).select('*').single())
}
