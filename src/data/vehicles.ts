import { supabase } from '../lib/supabase.ts'
import { normalizeVin, validateVehicleInput } from '../shared/validation.ts'
import type { Vehicle, VehicleInput, VehicleWithCustomer } from '../shared/types.ts'
import { DuplicateError, ValidationError, toDataError } from './errors.ts'
import { sanitizeSearchTerm, sanitizeSearchWords } from './filters.ts'
import { unwrap } from './unwrap.ts'

const VEHICLE_WITH_CUSTOMER_SELECT = '*, customer:customers(id,name,phone)'

export async function listVehiclesForCustomer(customerId: string): Promise<Vehicle[]> {
  return unwrap(
    await supabase.from('vehicles').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
  )
}

export async function getVehicle(id: string): Promise<Vehicle> {
  return unwrap(await supabase.from('vehicles').select('*').eq('id', id).single())
}

export async function findVehicleByVin(vin: string): Promise<Vehicle | null> {
  const normalized = normalizeVin(vin)
  if (!normalized) return null
  const { data, error } = await supabase.from('vehicles').select('*').eq('vin', normalized).maybeSingle()
  if (error) throw toDataError(error)
  return data
}

export async function searchVehicles(query: string, limit = 20): Promise<VehicleWithCustomer[]> {
  const trimmed = query.trim()
  const base = supabase.from('vehicles').select(VEHICLE_WITH_CUSTOMER_SELECT).order('updated_at', { ascending: false }).limit(limit)

  if (!trimmed) return unwrap(await base)

  const safeFull = sanitizeSearchTerm(trimmed)
  const words = sanitizeSearchWords(trimmed)
  // normalizeVin only strips whitespace/dashes, not other reserved filter
  // characters (e.g. a comma in "Honda, Civic") — sanitize before interpolating.
  const vinPrefix = sanitizeSearchTerm(normalizeVin(trimmed) ?? '')

  const clauses: string[] = []
  if (vinPrefix) clauses.push(`vin.ilike.${vinPrefix}%`)
  if (safeFull) {
    clauses.push(`make.ilike.%${safeFull}%`)
    clauses.push(`model.ilike.%${safeFull}%`)
  }
  // Multi-word query (e.g. "Honda Civic"): also match when every word hits
  // make-or-model individually, even if the fields never contain the full phrase.
  if (words.length > 1) {
    clauses.push(`and(${words.map((w) => `or(make.ilike.%${w}%,model.ilike.%${w}%)`).join(',')})`)
  }

  if (clauses.length === 0) return unwrap(await base)

  return unwrap(await base.or(clauses.join(',')))
}

export async function createVehicle(input: VehicleInput): Promise<Vehicle> {
  const validated = validateVehicleInput(input)
  if (!validated.ok) throw new ValidationError(validated.errors)
  const value = validated.value

  if (value.vin) {
    const existing = await findVehicleByVin(value.vin)
    if (existing) throw new DuplicateError('vin', 'A vehicle with this VIN already exists.', existing)
  }

  return unwrap(await supabase.from('vehicles').insert(value).select('*').single())
}

export async function updateVehicle(id: string, patch: Partial<VehicleInput>): Promise<Vehicle> {
  const current = await getVehicle(id)
  const merged: VehicleInput = {
    customer_id: current.customer_id,
    year: current.year,
    make: current.make,
    model: current.model,
    trim: current.trim,
    vin: current.vin,
    glass_type: current.glass_type,
    adas_status: current.adas_status,
    verified_status: current.verified_status,
    notes: current.notes,
    ...patch,
  }

  const validated = validateVehicleInput(merged)
  if (!validated.ok) throw new ValidationError(validated.errors)
  const value = validated.value

  if (value.vin) {
    const existing = await findVehicleByVin(value.vin)
    if (existing && existing.id !== id) {
      throw new DuplicateError('vin', 'A vehicle with this VIN already exists.', existing)
    }
  }

  return unwrap(await supabase.from('vehicles').update(value).eq('id', id).select('*').single())
}
