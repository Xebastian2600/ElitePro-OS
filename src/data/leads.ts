import { supabase } from '../lib/supabase.ts'
import { validateLeadInput, validateLeadStatusChange } from '../shared/validation.ts'
import type { Lead, LeadInput, LeadStatus, LeadWithRefs } from '../shared/types.ts'
import { OPEN_LEAD_STATUSES } from '../shared/types.ts'
import { ValidationError } from './errors.ts'
import { unwrap } from './unwrap.ts'

const LEAD_WITH_REFS_SELECT = '*, customer:customers(id,name,phone,email), vehicle:vehicles(id,year,make,model,vin)'

export async function listLeads(options: { status?: LeadStatus; limit?: number } = {}): Promise<LeadWithRefs[]> {
  let query = supabase.from('leads').select(LEAD_WITH_REFS_SELECT).order('updated_at', { ascending: false })
  if (options.status) query = query.eq('status', options.status)
  if (options.limit) query = query.limit(options.limit)
  return unwrap(await query)
}

export async function getLead(id: string): Promise<LeadWithRefs> {
  return unwrap(await supabase.from('leads').select(LEAD_WITH_REFS_SELECT).eq('id', id).single())
}

export async function listOpenLeadsForCustomer(customerId: string): Promise<LeadWithRefs[]> {
  return unwrap(
    await supabase
      .from('leads')
      .select(LEAD_WITH_REFS_SELECT)
      .eq('customer_id', customerId)
      .in('status', OPEN_LEAD_STATUSES)
      .order('created_at', { ascending: false }),
  )
}

export async function createLead(input: LeadInput): Promise<Lead> {
  const validated = validateLeadInput(input)
  if (!validated.ok) throw new ValidationError(validated.errors)
  return unwrap(await supabase.from('leads').insert(validated.value).select('*').single())
}

export async function updateLead(id: string, patch: Partial<LeadInput>): Promise<Lead> {
  const current = await getLead(id)
  const merged: LeadInput = {
    customer_id: current.customer_id,
    vehicle_id: current.vehicle_id,
    source: current.source,
    request: current.request,
    status: current.status,
    assigned_user_id: current.assigned_user_id,
    next_action: current.next_action,
    next_action_at: current.next_action_at,
    lost_reason: current.lost_reason,
    ...patch,
  }

  const validated = validateLeadInput(merged)
  if (!validated.ok) throw new ValidationError(validated.errors)
  return unwrap(await supabase.from('leads').update(validated.value).eq('id', id).select('*').single())
}

export async function updateLeadStatus(id: string, status: LeadStatus, lost_reason?: string | null): Promise<Lead> {
  const validated = validateLeadStatusChange(status, lost_reason)
  if (!validated.ok) throw new ValidationError(validated.errors)
  return unwrap(
    await supabase
      .from('leads')
      .update({ status: validated.value.status, lost_reason: validated.value.lost_reason })
      .eq('id', id)
      .select('*')
      .single(),
  )
}
