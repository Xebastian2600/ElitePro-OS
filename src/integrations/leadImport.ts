// Pure mapping/validation (buildLeadImportPreview) plus a thin, injectable
// orchestrator (importLeads) for turning a parsed CSV into customers and
// leads. No Supabase import here — buildLeadImportPreview does no I/O at
// all, and importLeads takes its data dependencies as arguments so it can
// be unit tested without a database.

import { isValidEmail, normalizeEmail, normalizePhone } from '../shared/validation.ts'
import type { Customer, CustomerInput, Lead, LeadInput } from '../shared/types.ts'
import type { InboundLeadEvent } from './types.ts'

export type LeadImportField = 'name' | 'phone' | 'email' | 'address' | 'source' | 'request'

export const LEAD_IMPORT_COLUMNS: LeadImportField[] = ['name', 'phone', 'email', 'address', 'source', 'request']

// Recognized header aliases, matched case/space-insensitively. Keep this in
// sync with LEAD_IMPORT_COLUMNS.
const COLUMN_ALIASES: Record<LeadImportField, string[]> = {
  name: ['name', 'full name', 'customer', 'customer name'],
  phone: ['phone', 'phone number', 'mobile'],
  email: ['email', 'e-mail'],
  address: ['address'],
  source: ['source', 'lead source'],
  request: ['request', 'notes', 'message', 'description'],
}

const MAX_DATA_ROWS = 500

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, ' ')
}

export type LeadImportMapping = Record<LeadImportField, number | null>

function buildMapping(headers: string[]): LeadImportMapping {
  const normalized = headers.map(normalizeHeader)
  const mapping = {} as LeadImportMapping
  for (const field of LEAD_IMPORT_COLUMNS) {
    const aliases = COLUMN_ALIASES[field]
    const idx = normalized.findIndex((h) => aliases.includes(h))
    mapping[field] = idx === -1 ? null : idx
  }
  return mapping
}

function cellAt(row: string[], col: number | null): string {
  if (col == null) return ''
  return (row[col] ?? '').trim()
}

export interface LeadImportRowResult {
  index: number // 1-based data row number, excludes the header row
  event: InboundLeadEvent | null
  errors: string[]
}

export interface LeadImportPreview {
  headers: string[]
  mapping: LeadImportMapping
  rows: LeadImportRowResult[]
  missingRequired: string[]
}

export function buildLeadImportPreview(rows: string[][]): LeadImportPreview {
  const headers = (rows[0] ?? []).map((h) => h.trim())
  const mapping = buildMapping(headers)

  const missingRequired: string[] = []
  if (mapping.name == null) missingRequired.push('name')
  if (mapping.phone == null && mapping.email == null) {
    missingRequired.push('phone')
    missingRequired.push('email')
  }

  if (missingRequired.length > 0) {
    return { headers, mapping, rows: [], missingRequired }
  }

  const dataRows = rows.slice(1)
  const seenPhones = new Set<string>()
  const seenEmails = new Set<string>()
  const results: LeadImportRowResult[] = []

  for (let i = 0; i < dataRows.length; i++) {
    const rowIndex = i + 1

    if (rowIndex > MAX_DATA_ROWS) {
      results.push({
        index: rowIndex,
        event: null,
        errors: [`Exceeds the maximum of ${MAX_DATA_ROWS} data rows per import.`],
      })
      continue
    }

    const raw = dataRows[i]
    const errors: string[] = []

    const name = cellAt(raw, mapping.name)
    if (!name) errors.push('Name is required.')

    const phoneRaw = cellAt(raw, mapping.phone)
    let phone: string | null = null
    if (phoneRaw) {
      phone = normalizePhone(phoneRaw)
      if (!phone) errors.push('Invalid phone number.')
    }

    const emailRaw = cellAt(raw, mapping.email)
    let email: string | null = null
    if (emailRaw) {
      const normalized = normalizeEmail(emailRaw)
      if (!normalized || !isValidEmail(normalized)) {
        errors.push('Invalid email address.')
      } else {
        email = normalized
      }
    }

    if (!phone && !email) errors.push('Provide a phone number or email address.')

    if (phone) {
      if (seenPhones.has(phone)) errors.push('Duplicate phone number in this file.')
      else seenPhones.add(phone)
    }
    if (email) {
      if (seenEmails.has(email)) errors.push('Duplicate email address in this file.')
      else seenEmails.add(email)
    }

    const address = cellAt(raw, mapping.address) || null
    const source = cellAt(raw, mapping.source) || null
    const request = cellAt(raw, mapping.request) || null

    const event: InboundLeadEvent | null =
      errors.length === 0
        ? {
            source: 'csv',
            external_id: null,
            customer: { name, phone, email, address },
            lead: { source, request },
            received_at: new Date().toISOString(),
          }
        : null

    results.push({ index: rowIndex, event, errors })
  }

  return { headers, mapping, rows: results, missingRequired: [] }
}

// Mirrors the signature of logIntegrationEvent from src/data/integrationEvents.ts
// (owned by a separate, concurrently-built workstream). Duplicated here as a
// minimal structural type so this module has no import-time dependency on
// that file's existence — once it lands, its logIntegrationEvent can be
// passed straight through as this dep without changes.
export interface LogIntegrationEventInput {
  source: 'dialpad' | 'ghl' | 'hcp' | 'csv' | 'manual'
  direction: 'inbound' | 'outbound'
  event_type: string
  status?: 'received' | 'processed' | 'failed' | 'skipped'
  entity_type?: string | null
  entity_id?: string | null
  payload?: Record<string, unknown>
  error?: string | null
}

export interface ImportLeadsDeps {
  findCustomerMatches: (input: { phone?: string | null; email?: string | null }) => Promise<Customer[]>
  createCustomer: (input: CustomerInput) => Promise<Customer>
  createLead: (input: LeadInput) => Promise<Lead>
  logIntegrationEvent: (event: LogIntegrationEventInput) => Promise<unknown>
}

export type LeadImportRowStatus = 'created' | 'reused' | 'skipped' | 'failed'

export interface LeadImportRowOutcome {
  index: number
  status: LeadImportRowStatus
  customer_id: string | null
  lead_id: string | null
  reason: string | null
}

export interface LeadImportCounts {
  created_customers: number
  reused_customers: number
  leads_created: number
  skipped: number
  failed: number
}

export interface LeadImportResult {
  rows: LeadImportRowOutcome[]
  counts: LeadImportCounts
}

// The event log is secondary to the lead itself: a failed log write must not
// abort the import or turn a created lead into a "failed" row.
async function safeLog(deps: ImportLeadsDeps, input: Parameters<ImportLeadsDeps['logIntegrationEvent']>[0]): Promise<void> {
  try {
    await deps.logIntegrationEvent(input)
  } catch {
    // Swallowed on purpose; the per-row result returned to the caller is the source of truth.
  }
}

async function logSkipped(deps: ImportLeadsDeps, index: number, reason: string): Promise<void> {
  await safeLog(deps, {
    source: 'csv',
    direction: 'inbound',
    event_type: 'lead.imported',
    status: 'skipped',
    entity_type: 'lead',
    entity_id: null,
    payload: { row: index, reason },
  })
}

// Sequential by design (not Promise.all) — duplicate-customer checks and
// per-row error handling both depend on rows being applied one at a time.
export async function importLeads(preview: LeadImportPreview, deps: ImportLeadsDeps): Promise<LeadImportResult> {
  const rows: LeadImportRowOutcome[] = []
  const counts: LeadImportCounts = {
    created_customers: 0,
    reused_customers: 0,
    leads_created: 0,
    skipped: 0,
    failed: 0,
  }

  for (const row of preview.rows) {
    if (!row.event) {
      const reason = row.errors.join(' ') || 'Row failed validation.'
      await logSkipped(deps, row.index, reason)
      counts.skipped += 1
      rows.push({ index: row.index, status: 'skipped', customer_id: null, lead_id: null, reason })
      continue
    }

    const { event } = row
    // Tracked outside the try so a lead failure still reports a customer we created.
    let customerId: string | null = null
    let reused = false

    try {
      const matches = await deps.findCustomerMatches({ phone: event.customer.phone, email: event.customer.email })

      if (matches.length > 1) {
        const reason = 'Matches multiple existing customers'
        await logSkipped(deps, row.index, reason)
        counts.skipped += 1
        rows.push({ index: row.index, status: 'skipped', customer_id: null, lead_id: null, reason })
        continue
      }

      if (matches.length === 1) {
        customerId = matches[0].id
        reused = true
      } else {
        const created = await deps.createCustomer({
          name: event.customer.name,
          phone: event.customer.phone,
          email: event.customer.email,
          address: event.customer.address,
        })
        customerId = created.id
        reused = false
      }

      const lead = await deps.createLead({
        customer_id: customerId,
        source: event.lead.source ?? 'CSV import',
        request: event.lead.request,
        status: 'new',
      })

      if (reused) counts.reused_customers += 1
      else counts.created_customers += 1
      counts.leads_created += 1

      rows.push({
        index: row.index,
        status: reused ? 'reused' : 'created',
        customer_id: customerId,
        lead_id: lead.id,
        reason: null,
      })

      await safeLog(deps, {
        source: 'csv',
        direction: 'inbound',
        event_type: 'lead.imported',
        status: 'processed',
        entity_type: 'lead',
        entity_id: lead.id,
        payload: { row: row.index, customer_reused: reused },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      counts.failed += 1
      // A customer created before the lead failed still exists — count and report it.
      if (customerId && !reused) counts.created_customers += 1
      rows.push({ index: row.index, status: 'failed', customer_id: customerId, lead_id: null, reason: message })
      await safeLog(deps, {
        source: 'csv',
        direction: 'inbound',
        event_type: 'lead.imported',
        status: 'failed',
        entity_type: 'lead',
        entity_id: null,
        payload: { row: row.index, customer_id: customerId },
        error: message,
      })
    }
  }

  return { rows, counts }
}
