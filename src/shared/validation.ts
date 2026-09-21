// Pure validation/normalization helpers — no Supabase import. Used both by
// src/data/*.ts before writing and by the UI for inline feedback.

import type { AdasStatus, CustomerInput, JobInput, JobStatus, LeadInput, LeadStatus, VehicleInput, VerifiedStatus } from './types.ts'
import { ADAS_STATUSES, JOB_STATUSES, LEAD_STATUSES, VERIFIED_STATUSES } from './types.ts'

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

// US-default assumption: a bare 10-digit number is treated as a US number and
// gets a +1 prefix. Anything already carrying a '+' is treated as already
// having a country code and is passed through digit-for-digit.
export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const trimmed = raw.trim()
  if (trimmed === '') return null

  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/[^0-9]/g, '')

  if (hasPlus) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null
  }
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

export function formatPhone(e164: string): string {
  const match = /^\+1(\d{10})$/.exec(e164)
  if (!match) return e164
  const d = match[1]
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const trimmed = raw.trim().toLowerCase()
  return trimmed === '' ? null : trimmed
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function normalizeVin(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const cleaned = raw.trim().toUpperCase().replace(/[\s-]/g, '')
  return cleaned === '' ? null : cleaned
}

export function isValidVin(vin: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin)
}

export interface NormalizedCustomer {
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
}

export function validateCustomerInput(input: CustomerInput): ValidationResult<NormalizedCustomer> {
  const errors: Record<string, string> = {}

  const name = (input.name ?? '').trim()
  if (!name) errors.name = 'Name is required.'

  const rawPhone = input.phone ?? ''
  const rawEmail = input.email ?? ''
  const hasPhoneRaw = rawPhone.trim() !== ''
  const hasEmailRaw = rawEmail.trim() !== ''

  if (!hasPhoneRaw && !hasEmailRaw) {
    errors._ = 'Provide a phone number or email address.'
  }

  let phone: string | null = null
  if (hasPhoneRaw) {
    phone = normalizePhone(rawPhone)
    if (!phone) errors.phone = 'Enter a valid phone number.'
  }

  let email: string | null = null
  if (hasEmailRaw) {
    const normalized = normalizeEmail(rawEmail)
    if (!normalized || !isValidEmail(normalized)) {
      errors.email = 'Enter a valid email address.'
    } else {
      email = normalized
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: { name, phone, email, address: emptyToNull(input.address), notes: emptyToNull(input.notes) },
  }
}

export interface NormalizedVehicle {
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
}

export function validateVehicleInput(input: VehicleInput): ValidationResult<NormalizedVehicle> {
  const errors: Record<string, string> = {}

  const customer_id = (input.customer_id ?? '').trim()
  if (!customer_id) errors.customer_id = 'Customer is required.'

  const currentYear = new Date().getFullYear()
  let year: number | null = null
  if (input.year !== undefined && input.year !== null) {
    if (!Number.isInteger(input.year) || input.year < 1950 || input.year > currentYear + 2) {
      errors.year = `Year must be between 1950 and ${currentYear + 2}.`
    } else {
      year = input.year
    }
  }

  let vin: string | null = null
  if (input.vin && input.vin.trim() !== '') {
    const normalized = normalizeVin(input.vin)
    if (!normalized || !isValidVin(normalized)) {
      errors.vin = 'VIN must be 17 characters (letters and digits, no I, O, or Q).'
    } else {
      vin = normalized
    }
  }

  const make = emptyToNull(input.make)
  const model = emptyToNull(input.model)
  const trimValue = emptyToNull(input.trim)
  const glass_type = emptyToNull(input.glass_type)
  const notes = emptyToNull(input.notes)

  if (!vin && !(year && make && model)) {
    errors._ = 'Provide a VIN, or year, make, and model.'
  }

  const adas_status = input.adas_status ?? 'unknown'
  if (!ADAS_STATUSES.some((s) => s.value === adas_status)) errors.adas_status = 'Invalid ADAS status.'

  const verified_status = input.verified_status ?? 'unverified'
  if (!VERIFIED_STATUSES.some((s) => s.value === verified_status)) {
    errors.verified_status = 'Invalid verified status.'
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: { customer_id, year, make, model, trim: trimValue, vin, glass_type, adas_status, verified_status, notes },
  }
}

export interface NormalizedLead {
  customer_id: string | null
  vehicle_id: string | null
  source: string | null
  request: string | null
  status: LeadStatus
  assigned_user_id: string | null
  next_action: string | null
  next_action_at: string | null
  lost_reason: string | null
}

export function validateLeadInput(input: LeadInput): ValidationResult<NormalizedLead> {
  const errors: Record<string, string> = {}

  const customer_id = emptyToNull(input.customer_id ?? null)
  const vehicle_id = emptyToNull(input.vehicle_id ?? null)
  if (vehicle_id && !customer_id) errors.vehicle_id = 'A vehicle requires a customer.'

  const status = input.status ?? 'new'
  if (!LEAD_STATUSES.some((s) => s.value === status)) errors.status = 'Invalid lead status.'

  const lost_reason = emptyToNull(input.lost_reason)
  if (status === 'lost' && !lost_reason) errors.lost_reason = 'Lost reason is required.'

  let next_action_at: string | null = null
  if (input.next_action_at) {
    if (isNaN(new Date(input.next_action_at).getTime())) {
      errors.next_action_at = 'Invalid date.'
    } else {
      next_action_at = input.next_action_at
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      customer_id,
      vehicle_id,
      source: emptyToNull(input.source),
      request: emptyToNull(input.request),
      status,
      assigned_user_id: emptyToNull(input.assigned_user_id ?? null),
      next_action: emptyToNull(input.next_action),
      next_action_at,
      lost_reason: status === 'lost' ? lost_reason : null,
    },
  }
}

export function validateLeadStatusChange(
  status: LeadStatus,
  lost_reason?: string | null,
): ValidationResult<{ status: LeadStatus; lost_reason: string | null }> {
  const errors: Record<string, string> = {}

  if (!LEAD_STATUSES.some((s) => s.value === status)) errors.status = 'Invalid lead status.'

  const reason = emptyToNull(lost_reason ?? null)
  if (status === 'lost' && !reason) errors.lost_reason = 'Lost reason is required.'

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return { ok: true, value: { status, lost_reason: status === 'lost' ? reason : null } }
}

export interface NormalizedJob {
  customer_id: string
  vehicle_id: string
  quote_id: string | null
  status: JobStatus
  appointment_at: string | null
  address: string | null
  technician_id: string | null
  notes: string | null
}

export function validateJobInput(input: JobInput): ValidationResult<NormalizedJob> {
  const errors: Record<string, string> = {}

  const customer_id = (input.customer_id ?? '').trim()
  if (!customer_id) errors.customer_id = 'Customer is required.'

  const vehicle_id = (input.vehicle_id ?? '').trim()
  if (!vehicle_id) errors.vehicle_id = 'Vehicle is required.'

  let quote_id: string | null = null
  if (input.quote_id && input.quote_id.trim() !== '') {
    const trimmed = input.quote_id.trim()
    if (!UUID_RE.test(trimmed)) {
      errors.quote_id = 'Invalid quote id.'
    } else {
      quote_id = trimmed
    }
  }

  const status = input.status ?? 'new'
  if (!JOB_STATUSES.some((s) => s.value === status)) errors.status = 'Invalid job status.'

  let appointment_at: string | null = null
  if (input.appointment_at) {
    if (isNaN(new Date(input.appointment_at).getTime())) {
      errors.appointment_at = 'Invalid date.'
    } else {
      appointment_at = input.appointment_at
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      customer_id,
      vehicle_id,
      quote_id,
      status,
      appointment_at,
      address: emptyToNull(input.address),
      technician_id: emptyToNull(input.technician_id ?? null),
      notes: emptyToNull(input.notes),
    },
  }
}
