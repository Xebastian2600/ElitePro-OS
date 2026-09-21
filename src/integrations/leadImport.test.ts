import { describe, expect, it, vi } from 'vitest'
import { parseCsv } from './csv.ts'
import { buildLeadImportPreview, importLeads } from './leadImport.ts'
import type { ImportLeadsDeps, LeadImportPreview } from './leadImport.ts'
import type { Customer, Lead } from '../shared/types.ts'

function rowsFrom(csv: string): string[][] {
  return parseCsv(csv)
}

describe('buildLeadImportPreview', () => {
  it('maps recognized header aliases regardless of case/spacing', () => {
    const rows = rowsFrom('Full Name,Mobile,E-Mail,Address,Lead Source,Notes\nJane Doe,555-123-4567,jane@x.com,1 Main St,Website,Wants a quote')
    const preview = buildLeadImportPreview(rows)

    expect(preview.mapping).toEqual({ name: 0, phone: 1, email: 2, address: 3, source: 4, request: 5 })
    expect(preview.missingRequired).toEqual([])
    expect(preview.rows).toHaveLength(1)
    expect(preview.rows[0].errors).toEqual([])
    expect(preview.rows[0].event).toEqual({
      source: 'csv',
      external_id: null,
      customer: { name: 'Jane Doe', phone: '+15551234567', email: 'jane@x.com', address: '1 Main St' },
      lead: { source: 'Website', request: 'Wants a quote' },
      received_at: expect.any(String),
    })
  })

  it('flags a missing name column via missingRequired', () => {
    const rows = rowsFrom('phone,email\n5551234567,jane@x.com')
    const preview = buildLeadImportPreview(rows)
    expect(preview.missingRequired).toContain('name')
    expect(preview.rows).toEqual([])
  })

  it('flags missing phone and email columns via missingRequired', () => {
    const rows = rowsFrom('name,address\nJane Doe,1 Main St')
    const preview = buildLeadImportPreview(rows)
    expect(preview.missingRequired).toContain('phone')
    expect(preview.missingRequired).toContain('email')
  })

  it('errors on an invalid phone number', () => {
    const rows = rowsFrom('name,phone\nJane Doe,123')
    const preview = buildLeadImportPreview(rows)
    expect(preview.rows[0].errors).toContain('Invalid phone number.')
    expect(preview.rows[0].event).toBeNull()
  })

  it('errors on an invalid email address', () => {
    const rows = rowsFrom('name,email\nJane Doe,not-an-email')
    const preview = buildLeadImportPreview(rows)
    expect(preview.rows[0].errors).toContain('Invalid email address.')
    expect(preview.rows[0].event).toBeNull()
  })

  it('requires at least one of phone or email per row', () => {
    const rows = rowsFrom('name,phone,email\nJane Doe,,')
    const preview = buildLeadImportPreview(rows)
    expect(preview.rows[0].errors).toContain('Provide a phone number or email address.')
  })

  it('flags duplicate phone numbers within the file on the later row only', () => {
    const rows = rowsFrom('name,phone\nJane Doe,5551234567\nJohn Doe,555-123-4567')
    const preview = buildLeadImportPreview(rows)
    expect(preview.rows[0].errors).toEqual([])
    expect(preview.rows[1].errors).toContain('Duplicate phone number in this file.')
  })

  it('flags duplicate emails within the file on the later row only', () => {
    const rows = rowsFrom('name,email\nJane Doe,jane@x.com\nJohn Doe,JANE@X.COM')
    const preview = buildLeadImportPreview(rows)
    expect(preview.rows[0].errors).toEqual([])
    expect(preview.rows[1].errors).toContain('Duplicate email address in this file.')
  })

  it('caps at 500 data rows and errors on rows beyond the limit', () => {
    const header = 'name,phone\n'
    const dataLines = Array.from({ length: 501 }, (_, i) => `Person ${i},555000${String(i).padStart(4, '0')}`)
    const rows = rowsFrom(header + dataLines.join('\n'))
    const preview = buildLeadImportPreview(rows)

    expect(preview.rows).toHaveLength(501)
    expect(preview.rows[499].errors).toEqual([])
    expect(preview.rows[500].errors[0]).toMatch(/maximum of 500/i)
    expect(preview.rows[500].event).toBeNull()
  })
})

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'cust-1',
    name: 'Jane Doe',
    phone: '+15551234567',
    email: 'jane@x.com',
    address: null,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    customer_id: 'cust-1',
    vehicle_id: null,
    source: 'CSV import',
    request: null,
    status: 'new',
    assigned_user_id: null,
    next_action: null,
    next_action_at: null,
    lost_reason: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function previewFor(csv: string): LeadImportPreview {
  return buildLeadImportPreview(rowsFrom(csv))
}

describe('importLeads', () => {
  it('reuses a single matching customer', async () => {
    const preview = previewFor('name,phone\nJane Doe,5551234567')
    const existing = makeCustomer()
    const deps: ImportLeadsDeps = {
      findCustomerMatches: vi.fn().mockResolvedValue([existing]),
      createCustomer: vi.fn(),
      createLead: vi.fn().mockResolvedValue(makeLead()),
      logIntegrationEvent: vi.fn().mockResolvedValue(undefined),
    }

    const result = await importLeads(preview, deps)

    expect(deps.createCustomer).not.toHaveBeenCalled()
    expect(deps.createLead).toHaveBeenCalledWith(
      expect.objectContaining({ customer_id: 'cust-1', status: 'new' }),
    )
    expect(result.counts).toEqual({ created_customers: 0, reused_customers: 1, leads_created: 1, skipped: 0, failed: 0 })
    expect(result.rows[0]).toEqual({ index: 1, status: 'reused', customer_id: 'cust-1', lead_id: 'lead-1', reason: null })
    expect(deps.logIntegrationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'csv', direction: 'inbound', status: 'processed', entity_id: 'lead-1' }),
    )
  })

  it('skips a row that matches multiple existing customers', async () => {
    const preview = previewFor('name,phone\nJane Doe,5551234567')
    const deps: ImportLeadsDeps = {
      findCustomerMatches: vi.fn().mockResolvedValue([makeCustomer({ id: 'a' }), makeCustomer({ id: 'b' })]),
      createCustomer: vi.fn(),
      createLead: vi.fn(),
      logIntegrationEvent: vi.fn().mockResolvedValue(undefined),
    }

    const result = await importLeads(preview, deps)

    expect(deps.createCustomer).not.toHaveBeenCalled()
    expect(deps.createLead).not.toHaveBeenCalled()
    expect(result.counts.skipped).toBe(1)
    expect(result.rows[0].status).toBe('skipped')
    expect(result.rows[0].reason).toMatch(/multiple existing customers/i)
    expect(deps.logIntegrationEvent).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped' }))
  })

  it('creates a new customer when there is no match', async () => {
    const preview = previewFor('name,phone\nJane Doe,5551234567')
    const created = makeCustomer({ id: 'new-cust' })
    const deps: ImportLeadsDeps = {
      findCustomerMatches: vi.fn().mockResolvedValue([]),
      createCustomer: vi.fn().mockResolvedValue(created),
      createLead: vi.fn().mockResolvedValue(makeLead({ customer_id: 'new-cust' })),
      logIntegrationEvent: vi.fn().mockResolvedValue(undefined),
    }

    const result = await importLeads(preview, deps)

    expect(deps.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Jane Doe', phone: '+15551234567' }),
    )
    expect(result.counts.created_customers).toBe(1)
    expect(result.counts.reused_customers).toBe(0)
    expect(result.rows[0].status).toBe('created')
  })

  it('logs a failed row and continues to the next row when createLead throws', async () => {
    const preview = previewFor('name,phone\nJane Doe,5551234567\nJohn Smith,5559876543')
    const deps: ImportLeadsDeps = {
      findCustomerMatches: vi.fn().mockResolvedValue([]),
      createCustomer: vi.fn().mockResolvedValue(makeCustomer({ id: 'new-cust' })),
      createLead: vi
        .fn()
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValueOnce(makeLead({ id: 'lead-2', customer_id: 'new-cust' })),
      logIntegrationEvent: vi.fn().mockResolvedValue(undefined),
    }

    const result = await importLeads(preview, deps)

    expect(result.counts.failed).toBe(1)
    // The customer was created before the lead failed, so it is reported and counted.
    expect(result.rows[0]).toEqual({ index: 1, status: 'failed', customer_id: 'new-cust', lead_id: null, reason: 'db down' })
    expect(result.counts.created_customers).toBe(2)
    expect(deps.logIntegrationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error: 'db down' }),
    )
    // second row still processed
    expect(result.rows[1].status).toBe('created')
    expect(result.counts.leads_created).toBe(1)
  })

  it('a failing event log never fails the import or double-counts a created lead', async () => {
    const preview = previewFor('name,phone\nJane Doe,5551234567\n,5559876543')
    const deps: ImportLeadsDeps = {
      findCustomerMatches: vi.fn().mockResolvedValue([]),
      createCustomer: vi.fn().mockResolvedValue(makeCustomer({ id: 'new-cust' })),
      createLead: vi.fn().mockResolvedValue(makeLead({ id: 'lead-1', customer_id: 'new-cust' })),
      logIntegrationEvent: vi.fn().mockRejectedValue(new Error('log table unavailable')),
    }

    const result = await importLeads(preview, deps)

    expect(result.rows.map((r) => r.status)).toEqual(['created', 'skipped'])
    expect(result.counts).toEqual({ created_customers: 1, reused_customers: 0, leads_created: 1, skipped: 1, failed: 0 })
  })

  it('logs and counts rows that failed preview validation as skipped', async () => {
    const preview = previewFor('name,phone\n,5551234567')
    const deps: ImportLeadsDeps = {
      findCustomerMatches: vi.fn(),
      createCustomer: vi.fn(),
      createLead: vi.fn(),
      logIntegrationEvent: vi.fn().mockResolvedValue(undefined),
    }

    const result = await importLeads(preview, deps)

    expect(deps.findCustomerMatches).not.toHaveBeenCalled()
    expect(result.counts.skipped).toBe(1)
    expect(result.rows[0].status).toBe('skipped')
    expect(deps.logIntegrationEvent).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped' }))
  })
})
