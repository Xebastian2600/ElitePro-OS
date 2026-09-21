// Runs against a local Supabase instance (see .env.test.local / vitest.integration.config.ts).
// Start it with `npx supabase start`, then `npm run test:integration`.

import { createClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { supabase } from '../lib/supabase.ts'
import { createCustomer, findCustomerMatches, searchCustomers } from '../data/customers.ts'
import { createVehicle, searchVehicles, updateVehicle } from '../data/vehicles.ts'
import { createLead, updateLead, updateLeadStatus } from '../data/leads.ts'
import { createJobFromQuote, updateJob, updateJobStatus } from '../data/jobs.ts'
import { listActivityForEntity } from '../data/activity.ts'
import { DuplicateError, ValidationError } from '../data/errors.ts'
import type { Customer, Vehicle } from '../shared/types.ts'

// Per-run unique suffix ensures test is re-runnable without DB reset
const RUN = String(Math.floor(1000 + Math.random() * 9000))

let userId: string

beforeAll(async () => {
  const email = `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  const { data, error } = await supabase.auth.signUp({ email, password: 'password123!' })
  if (error) throw error
  if (!data.user) throw new Error('signUp did not return a user (local auth should auto-confirm).')
  userId = data.user.id
})

describe('core CRM flow', () => {
  let customer: Customer
  let otherCustomer: Customer
  let vehicle: Vehicle
  let leadId: string
  let jobId: string
  const quoteId = crypto.randomUUID()

  it('creates a customer', async () => {
    customer = await createCustomer({
      name: 'Jane Doe',
      phone: `(555) ${RUN.slice(0, 3)}-${RUN}`,
      email: `test+${RUN}@example.com`,
    })
    expect(customer.id).toBeTruthy()
    expect(customer.phone).toBe(`+1555${RUN.slice(0, 3)}${RUN}`)
    expect(customer.email).toBe(`test+${RUN}@example.com`)
  })

  it('finds the customer by a differently-formatted phone and differently-cased email', async () => {
    const byPhone = await findCustomerMatches({ phone: `555.${RUN.slice(0, 3)}.${RUN}` })
    expect(byPhone.map((c) => c.id)).toContain(customer.id)

    const byEmail = await findCustomerMatches({ email: `TEST+${RUN}@EXAMPLE.COM` })
    expect(byEmail.map((c) => c.id)).toContain(customer.id)
  })

  it('rejects creating a customer with a duplicate phone', async () => {
    await expect(createCustomer({ name: 'Impostor', phone: `555${RUN.slice(0, 3)}${RUN}` })).rejects.toBeInstanceOf(DuplicateError)
  })

  it('creates a second customer for the cross-ownership check', async () => {
    otherCustomer = await createCustomer({ name: 'Other Customer', phone: `(666) 999-${RUN}` })
    expect(otherCustomer.id).toBeTruthy()
  })

  it('creates a vehicle', async () => {
    const vin = `1HGCM82633A00${RUN}`
    vehicle = await createVehicle({ customer_id: customer.id, vin })
    expect(vehicle.id).toBeTruthy()
    expect(vehicle.vin).toBe(vin)
  })

  it('rejects a duplicate VIN', async () => {
    const vin = `1hgcm82633a00${RUN}`
    await expect(createVehicle({ customer_id: customer.id, vin })).rejects.toBeInstanceOf(DuplicateError)
  })

  it('rejects a lead pairing the vehicle with a different customer (DB trigger)', async () => {
    await expect(
      createLead({ customer_id: otherCustomer.id, vehicle_id: vehicle.id, source: 'phone', request: 'test' }),
    ).rejects.toThrow()
  })

  it('creates a lead', async () => {
    const lead = await createLead({
      customer_id: customer.id,
      vehicle_id: vehicle.id,
      source: 'phone',
      request: 'Windshield replacement',
    })
    leadId = lead.id
    expect(lead.status).toBe('new')
  })

  it('walks the lead through contacted -> qualified -> quoted', async () => {
    await updateLeadStatus(leadId, 'contacted')
    await updateLeadStatus(leadId, 'qualified')
    const quoted = await updateLeadStatus(leadId, 'quoted')
    expect(quoted.status).toBe('quoted')
  })

  it('rejects moving a lead to lost without a reason', async () => {
    await expect(updateLeadStatus(leadId, 'lost')).rejects.toBeInstanceOf(ValidationError)
  })

  it('creates a job from the quote', async () => {
    const job = await createJobFromQuote({
      quote_id: quoteId,
      customer_id: customer.id,
      vehicle_id: vehicle.id,
    })
    jobId = job.id
    expect(job.status).toBe('booked')
    expect(job.quote_id).toBe(quoteId)
  })

  it('rejects a second job for the same quote_id', async () => {
    await expect(
      createJobFromQuote({ quote_id: quoteId, customer_id: customer.id, vehicle_id: vehicle.id }),
    ).rejects.toBeInstanceOf(DuplicateError)
  })

  it('books the lead and schedules the job', async () => {
    const booked = await updateLeadStatus(leadId, 'booked')
    expect(booked.status).toBe('booked')

    const scheduled = await updateJobStatus(jobId, 'scheduled')
    expect(scheduled.status).toBe('scheduled')
  })

  it('rejects updateJobStatus with an invalid status', async () => {
    // @ts-expect-error testing runtime validation of an out-of-union value
    await expect(updateJobStatus(jobId, 'bogus')).rejects.toBeInstanceOf(ValidationError)
  })

  it('a partial updateLead only changes the given fields', async () => {
    const updated = await updateLead(leadId, { next_action: 'Call back tomorrow' })
    expect(updated.next_action).toBe('Call back tomorrow')
    expect(updated.status).toBe('booked')
    expect(updated.customer_id).toBe(customer.id)
    expect(updated.request).toBe('Windshield replacement')
  })

  it('a partial updateJob only changes the given fields', async () => {
    const updated = await updateJob(jobId, { notes: 'Customer requested a morning appointment' })
    expect(updated.notes).toBe('Customer requested a morning appointment')
    expect(updated.quote_id).toBe(quoteId)
    expect(updated.status).toBe('scheduled')
  })

  it('a partial updateVehicle only changes the given fields', async () => {
    const updated = await updateVehicle(vehicle.id, { notes: 'Customer prefers OEM glass' })
    expect(updated.notes).toBe('Customer prefers OEM glass')
    expect(updated.adas_status).toBe('unknown')
    expect(updated.vin).toBe(`1HGCM82633A00${RUN}`)
  })

  it('searches vehicles by a comma-separated multi-word query without throwing', async () => {
    const civic = await createVehicle({ customer_id: customer.id, year: 2020, make: 'Honda', model: 'Civic' })

    const results = await searchVehicles('Honda, Civic')
    expect(Array.isArray(results)).toBe(true)
    expect(results.some((v) => v.id === civic.id)).toBe(true)
  })

  it('finds a customer by the last 4 digits of their phone', async () => {
    const results = await searchCustomers(RUN)
    expect(results.some((c) => c.id === customer.id)).toBe(true)
  })

  it('logs activity for every step, attributed to the signed-in user', async () => {
    const customerActivity = await listActivityForEntity('customer', customer.id)
    expect(customerActivity.some((a) => a.action === 'customer.created')).toBe(true)

    const vehicleActivity = await listActivityForEntity('vehicle', vehicle.id)
    expect(vehicleActivity.some((a) => a.action === 'vehicle.created')).toBe(true)

    const leadActivity = await listActivityForEntity('lead', leadId)
    expect(leadActivity.some((a) => a.action === 'lead.created')).toBe(true)
    const statusChange = leadActivity.find(
      (a) => a.action === 'lead.status_changed' && a.metadata.from === 'new' && a.metadata.to === 'contacted',
    )
    expect(statusChange).toBeDefined()
    expect(statusChange?.metadata.before).toEqual({ status: 'new' })
    expect(statusChange?.metadata.after).toEqual({ status: 'contacted' })

    const jobActivity = await listActivityForEntity('job', jobId)
    expect(jobActivity.some((a) => a.action === 'job.created')).toBe(true)
    expect(jobActivity.some((a) => a.action === 'job.status_changed')).toBe(true)

    const allActivity = [...customerActivity, ...vehicleActivity, ...leadActivity, ...jobActivity]
    expect(allActivity.length).toBeGreaterThan(0)
    for (const row of allActivity) {
      expect(row.actor_id).toBe(userId)
    }
  })
})

describe('RLS boundaries', () => {
  it('blocks an unauthenticated client from reading customers', async () => {
    const anonClient = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
    const { data, error } = await anonClient.from('customers').select('*')
    expect(error !== null || (data ?? []).length === 0).toBe(true)
  })

  it('blocks an authenticated client from inserting into activity directly', async () => {
    const { error } = await supabase
      .from('activity')
      .insert({ entity_type: 'customer', entity_id: crypto.randomUUID(), action: 'fake.action' })
    expect(error).not.toBeNull()
  })
})
