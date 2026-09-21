import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './App.tsx'
import { LeadStatusControl } from './components/lead/LeadStatusControl.tsx'
import type { Customer, JobWithRefs, LeadWithRefs, Vehicle } from './shared/types.ts'

// Shared mutable auth state, read by the mocked supabase client below.
// Must use vi.hoisted so it exists before vi.mock factories run.
const authState = vi.hoisted(() => ({
  session: {
    user: { id: 'user-1', email: 'csr@example.com' },
    access_token: 'test-token',
  } as unknown as null | { user: { id: string; email: string }; access_token: string },
}))

vi.mock('./lib/supabase.ts', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: authState.session }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: () => Promise.resolve({ data: {}, error: null }),
      signOut: () => Promise.resolve({ error: null }),
    },
  },
}))

const customerFixture: Customer = {
  id: 'cust-1',
  name: 'Jane Doe',
  phone: '+15551234567',
  email: 'jane@example.com',
  address: '123 Main St',
  notes: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const vehicleFixture: Vehicle = {
  id: 'veh-1',
  customer_id: 'cust-1',
  year: 2020,
  make: 'Honda',
  model: 'Accord',
  trim: null,
  vin: '1HGCM82633A004352',
  glass_type: 'Windshield',
  adas_status: 'unknown',
  verified_status: 'unverified',
  notes: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const leadFixture: LeadWithRefs = {
  id: 'lead-1',
  customer_id: 'cust-1',
  vehicle_id: null,
  source: 'Phone',
  request: 'Windshield crack',
  status: 'new',
  assigned_user_id: null,
  next_action: null,
  next_action_at: null,
  lost_reason: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  customer: { id: 'cust-1', name: 'Jane Doe', phone: '+15551234567', email: 'jane@example.com' },
  vehicle: null,
}

const jobFixture: JobWithRefs = {
  id: 'job-1',
  quote_id: '123e4567-e89b-12d3-a456-426614174000',
  customer_id: 'cust-1',
  vehicle_id: 'veh-1',
  status: 'booked',
  appointment_at: null,
  address: null,
  technician_id: null,
  notes: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  customer: { id: 'cust-1', name: 'Jane Doe', phone: '+15551234567', email: 'jane@example.com' },
  vehicle: { id: 'veh-1', year: 2020, make: 'Honda', model: 'Accord', vin: '1HGCM82633A004352' },
}

vi.mock('./data/customers.ts', () => ({
  listRecentCustomers: vi.fn(async () => [customerFixture]),
  searchCustomers: vi.fn(async () => [customerFixture]),
  getCustomer: vi.fn(async () => customerFixture),
  findCustomerMatches: vi.fn(async () => []),
  createCustomer: vi.fn(async () => customerFixture),
  updateCustomer: vi.fn(async () => customerFixture),
}))

vi.mock('./data/vehicles.ts', () => ({
  listVehiclesForCustomer: vi.fn(async () => [vehicleFixture]),
  getVehicle: vi.fn(async () => vehicleFixture),
  findVehicleByVin: vi.fn(async () => null),
  searchVehicles: vi.fn(async () => []),
  createVehicle: vi.fn(async () => vehicleFixture),
  updateVehicle: vi.fn(async () => vehicleFixture),
}))

const updateLeadStatusMock = vi.hoisted(() => vi.fn())

vi.mock('./data/leads.ts', () => ({
  listLeads: vi.fn(async () => [leadFixture]),
  getLead: vi.fn(async () => leadFixture),
  listOpenLeadsForCustomer: vi.fn(async () => []),
  createLead: vi.fn(async () => leadFixture),
  updateLead: vi.fn(async () => leadFixture),
  updateLeadStatus: updateLeadStatusMock,
}))

vi.mock('./data/jobs.ts', () => ({
  listJobs: vi.fn(async () => [jobFixture]),
  getJob: vi.fn(async () => jobFixture),
  findJobByQuoteId: vi.fn(async () => null),
  createJob: vi.fn(async () => jobFixture),
  createJobFromQuote: vi.fn(async () => jobFixture),
  updateJob: vi.fn(async () => jobFixture),
  updateJobStatus: vi.fn(async () => jobFixture),
}))

vi.mock('./data/activity.ts', () => ({
  listActivityForEntity: vi.fn(async () => []),
  listActivityForEntities: vi.fn(async () => []),
}))

updateLeadStatusMock.mockResolvedValue(leadFixture)

beforeEach(() => {
  authState.session = {
    user: { id: 'user-1', email: 'csr@example.com' },
    access_token: 'test-token',
  }
  updateLeadStatusMock.mockClear()
})

afterEach(() => {
  cleanup()
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

describe('routes', () => {
  it('renders the home page', async () => {
    renderAt('/')
    expect(await screen.findByRole('heading', { name: /front desk/i })).toBeInTheDocument()
  })

  it('renders the customers list page', async () => {
    renderAt('/customers')
    expect(await screen.findByRole('heading', { name: /^customers$/i })).toBeInTheDocument()
  })

  it('renders the customer detail page', async () => {
    renderAt('/customers/cust-1')
    expect(await screen.findByRole('heading', { name: /jane doe/i })).toBeInTheDocument()
  })

  it('renders the leads pipeline page', async () => {
    renderAt('/leads')
    expect(await screen.findByRole('heading', { name: /^leads$/i })).toBeInTheDocument()
  })

  it('renders the lead intake page', async () => {
    renderAt('/leads/new')
    expect(await screen.findByRole('heading', { name: /new lead/i })).toBeInTheDocument()
  })

  it('renders the lead detail page', async () => {
    renderAt('/leads/lead-1')
    expect(await screen.findByText(/create job from quote/i)).toBeInTheDocument()
  })

  it('renders the jobs list page', async () => {
    renderAt('/jobs')
    expect(await screen.findByRole('heading', { name: /^jobs$/i })).toBeInTheDocument()
  })

  it('renders the job detail page', async () => {
    renderAt('/jobs/job-1')
    expect(await screen.findAllByText(/jane doe/i)).not.toHaveLength(0)
  })

  it('renders the not found page for an unknown route', async () => {
    renderAt('/this-route-does-not-exist')
    expect(await screen.findByRole('heading', { name: /page not found/i })).toBeInTheDocument()
  })

  it('shows the sign-in form when signed out', async () => {
    authState.session = null
    renderAt('/')
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })
})

describe('mobile navigation menu', () => {
  it('opens the menu on toggle and closes it after navigating', async () => {
    const user = userEvent.setup()
    renderAt('/')
    await screen.findByRole('heading', { name: /front desk/i })

    const toggle = screen.getByRole('button', { name: /open menu/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(screen.getByRole('link', { name: 'Leads' }))

    expect(await screen.findByRole('heading', { name: /^leads$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open menu/i })).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('LeadStatusControl', () => {
  it('requires a lost reason before calling updateLeadStatus with Lost', async () => {
    const user = userEvent.setup()
    render(<LeadStatusControl lead={leadFixture} onChanged={() => {}} />)

    await user.selectOptions(screen.getByLabelText(/status/i), 'lost')
    await user.click(screen.getByRole('button', { name: /update status/i }))

    expect(updateLeadStatusMock).not.toHaveBeenCalled()
    expect(await screen.findByText(/lost reason is required/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/lost reason/i), 'Went with a competitor')
    await user.click(screen.getByRole('button', { name: /update status/i }))

    expect(updateLeadStatusMock).toHaveBeenCalledTimes(1)
  })
})
