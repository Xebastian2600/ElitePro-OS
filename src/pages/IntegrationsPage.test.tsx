import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IntegrationsPage } from './IntegrationsPage.tsx'
import type { Customer } from '../shared/types.ts'

const findCustomerMatchesMock = vi.hoisted(() => vi.fn())
const createCustomerMock = vi.hoisted(() => vi.fn())
const createLeadMock = vi.hoisted(() => vi.fn())
const listIntegrationEventsMock = vi.hoisted(() => vi.fn())
const logIntegrationEventMock = vi.hoisted(() => vi.fn())

vi.mock('../data/customers.ts', () => ({
  findCustomerMatches: findCustomerMatchesMock,
  createCustomer: createCustomerMock,
}))

vi.mock('../data/leads.ts', () => ({
  createLead: createLeadMock,
}))

vi.mock('../data/integrationEvents.ts', () => ({
  listIntegrationEvents: listIntegrationEventsMock,
  logIntegrationEvent: logIntegrationEventMock,
}))

const newCustomer: Customer = {
  id: 'cust-new',
  name: 'Jane Doe',
  phone: '+15551234567',
  email: 'jane@example.com',
  address: null,
  notes: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

afterEach(() => {
  cleanup()
  findCustomerMatchesMock.mockReset()
  createCustomerMock.mockReset()
  createLeadMock.mockReset()
  listIntegrationEventsMock.mockReset()
  logIntegrationEventMock.mockReset()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <IntegrationsPage />
    </MemoryRouter>,
  )
}

describe('IntegrationsPage', () => {
  it('shows every adapter as "Not connected"', async () => {
    listIntegrationEventsMock.mockResolvedValue([])
    renderPage()

    expect(screen.getByText('Dialpad')).toBeInTheDocument()
    expect(screen.getByText('GoHighLevel')).toBeInTheDocument()
    expect(screen.getByText('Housecall Pro')).toBeInTheDocument()
    expect(screen.getAllByText('Not connected')).toHaveLength(3)

    expect(await screen.findByText('No integration events yet.')).toBeInTheDocument()
  })

  it('shows preview rows and errors after pasting a CSV', async () => {
    listIntegrationEventsMock.mockResolvedValue([])
    renderPage()

    const csv = 'name,phone,email\nJane Doe,5551234567,jane@example.com\n,,\n'
    fireEvent.change(screen.getByLabelText(/or paste csv text/i), { target: { value: csv } })

    expect(await screen.findByText('Row 1')).toBeInTheDocument()
    expect(screen.getByText('Jane Doe · +15551234567 · jane@example.com')).toBeInTheDocument()
    expect(screen.getByText('Row 2')).toBeInTheDocument()
    expect(screen.getByText(/name is required/i)).toBeInTheDocument()
    expect(screen.getByText('1 of 2 rows are valid.')).toBeInTheDocument()
  })

  it('imports valid rows through importLeads with the real data deps and shows the result counts', async () => {
    listIntegrationEventsMock.mockResolvedValue([])
    findCustomerMatchesMock.mockResolvedValue([])
    createCustomerMock.mockResolvedValue(newCustomer)
    createLeadMock.mockResolvedValue({
      id: 'lead-100',
      customer_id: newCustomer.id,
      vehicle_id: null,
      source: 'CSV import',
      request: null,
      status: 'new',
      assigned_user_id: null,
      next_action: null,
      next_action_at: null,
      lost_reason: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    })
    logIntegrationEventMock.mockResolvedValue({})

    const user = userEvent.setup()
    renderPage()

    const csv = 'name,phone,email\nJane Doe,5551234567,jane@example.com\n'
    fireEvent.change(screen.getByLabelText(/or paste csv text/i), { target: { value: csv } })

    const importButton = await screen.findByRole('button', { name: /import 1 valid row/i })
    await user.click(importButton)

    await waitFor(() => expect(createLeadMock).toHaveBeenCalledTimes(1))
    expect(createCustomerMock).toHaveBeenCalledTimes(1)
    expect(findCustomerMatchesMock).toHaveBeenCalledWith({ phone: '+15551234567', email: 'jane@example.com' })

    expect(
      await screen.findByText(/created 1 customer\(s\), reused 0, created 1 lead\(s\), skipped 0, failed 0\./i),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /row 1/i })).toHaveAttribute('href', '/leads/lead-100')
  })
})
