import { supabase } from '../lib/supabase.ts'
import { normalizeEmail, normalizePhone, validateCustomerInput } from '../shared/validation.ts'
import type { Customer, CustomerInput } from '../shared/types.ts'
import { DuplicateError, ValidationError } from './errors.ts'
import { sanitizeSearchTerm } from './filters.ts'
import { unwrap } from './unwrap.ts'

export async function listRecentCustomers(limit = 20): Promise<Customer[]> {
  const result = await supabase.from('customers').select('*').order('updated_at', { ascending: false }).limit(limit)
  return unwrap(result)
}

export async function searchCustomers(query: string, limit = 20): Promise<Customer[]> {
  const trimmed = query.trim()
  if (!trimmed) return listRecentCustomers(limit)

  const base = supabase.from('customers').select('*').order('updated_at', { ascending: false }).limit(limit)

  if (trimmed.includes('@')) {
    const safe = sanitizeSearchTerm(trimmed.toLowerCase())
    return unwrap(await base.ilike('email', `%${safe}%`))
  }

  const normalizedPhone = normalizePhone(trimmed)
  if (normalizedPhone) {
    const digits = trimmed.replace(/[^0-9]/g, '')
    return unwrap(await base.or(`phone.eq.${normalizedPhone},phone.ilike.%${digits}%`))
  }

  // A digits-only fragment (e.g. the last 4 of a phone number) that isn't a
  // full phone number is almost certainly a phone lookup, not a name.
  if (/^\d{3,}$/.test(trimmed)) {
    return unwrap(await base.ilike('phone', `%${trimmed}%`))
  }

  const safe = sanitizeSearchTerm(trimmed)
  return unwrap(await base.ilike('name', `%${safe}%`))
}

export async function getCustomer(id: string): Promise<Customer> {
  return unwrap(await supabase.from('customers').select('*').eq('id', id).single())
}

export async function findCustomerMatches(input: { phone?: string | null; email?: string | null }): Promise<Customer[]> {
  const normalizedPhone = input.phone ? normalizePhone(input.phone) : null
  const normalizedEmail = input.email ? normalizeEmail(input.email) : null
  if (!normalizedPhone && !normalizedEmail) return []

  const filters: string[] = []
  if (normalizedPhone) filters.push(`phone.eq.${normalizedPhone}`)
  if (normalizedEmail) filters.push(`email.eq.${normalizedEmail}`)

  return unwrap(await supabase.from('customers').select('*').or(filters.join(',')))
}

function duplicateField(matches: Customer[], phone: string | null, email: string | null): 'phone' | 'email' {
  if (phone && matches.some((m) => m.phone === phone)) return 'phone'
  if (email && matches.some((m) => m.email === email)) return 'email'
  return phone ? 'phone' : 'email'
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  const validated = validateCustomerInput(input)
  if (!validated.ok) throw new ValidationError(validated.errors)
  const { name, phone, email, address, notes } = validated.value

  const matches = await findCustomerMatches({ phone, email })
  if (matches.length > 0) {
    const field = duplicateField(matches, phone, email)
    throw new DuplicateError(field, `A customer with this ${field} already exists.`, matches[0])
  }

  return unwrap(await supabase.from('customers').insert({ name, phone, email, address, notes }).select('*').single())
}

export async function updateCustomer(id: string, patch: Partial<CustomerInput>): Promise<Customer> {
  const current = await getCustomer(id)
  const merged: CustomerInput = {
    name: current.name,
    phone: current.phone,
    email: current.email,
    address: current.address,
    notes: current.notes,
    ...patch,
  }

  const validated = validateCustomerInput(merged)
  if (!validated.ok) throw new ValidationError(validated.errors)
  const { name, phone, email, address, notes } = validated.value

  const matches = await findCustomerMatches({ phone, email })
  const conflicting = matches.filter((m) => m.id !== id)
  if (conflicting.length > 0) {
    const field = duplicateField(conflicting, phone, email)
    throw new DuplicateError(field, `A customer with this ${field} already exists.`, conflicting[0])
  }

  return unwrap(
    await supabase.from('customers').update({ name, phone, email, address, notes }).eq('id', id).select('*').single(),
  )
}
