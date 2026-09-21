import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CopilotPanel } from './CopilotPanel.tsx'
import type { CopilotState } from '../../copilot/assess.ts'
import type { Customer, Vehicle } from '../../shared/types.ts'

afterEach(() => {
  cleanup()
})

const customer: Customer = {
  id: 'cust-1',
  name: 'Jane Doe',
  phone: null,
  email: null,
  address: null,
  notes: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const vehicle: Vehicle = {
  id: 'veh-1',
  customer_id: 'cust-1',
  year: 2020,
  make: 'Honda',
  model: 'Accord',
  trim: null,
  vin: null,
  glass_type: null,
  adas_status: 'unknown',
  verified_status: 'unverified',
  notes: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

function baseState(overrides: Partial<CopilotState> = {}): CopilotState {
  return {
    lead: null,
    customer,
    vehicle,
    quote: null,
    items: [],
    calculation: null,
    pricing: null,
    hasJob: false,
    kbAvailable: true,
    ...overrides,
  }
}

describe('CopilotPanel', () => {
  it('flags a missing VIN', () => {
    render(<CopilotPanel state={baseState()} />)
    expect(screen.getByText('Ask customer for VIN.')).toBeInTheDocument()
    expect(screen.getByText(/based on: vehicle\.vin is empty/i)).toBeInTheDocument()
  })

  it('flags an unknown ADAS status', () => {
    render(<CopilotPanel state={baseState()} />)
    expect(screen.getByText('Verify ADAS feature/KB before quoting.')).toBeInTheDocument()
  })

  it('shows a "Based on" basis caption for every item', () => {
    render(<CopilotPanel state={baseState()} />)
    const captions = screen.getAllByText(/^Based on:/)
    expect(captions.length).toBeGreaterThan(0)
  })

  it('shows a Look up in KB button when the KB is available', () => {
    render(<CopilotPanel state={baseState({ kbAvailable: true })} onKbLookup={() => {}} />)
    expect(screen.getAllByRole('button', { name: /look up in kb/i }).length).toBeGreaterThan(0)
  })

  it('does not show a Look up in KB button when the KB is unavailable', () => {
    render(<CopilotPanel state={baseState({ kbAvailable: false })} onKbLookup={() => {}} />)
    expect(screen.queryByRole('button', { name: /look up in kb/i })).not.toBeInTheDocument()
  })
})
