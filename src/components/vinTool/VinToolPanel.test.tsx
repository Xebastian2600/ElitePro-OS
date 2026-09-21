import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VinToolPanel } from './VinToolPanel.tsx'
import { AppRoutes } from '../../App.tsx'

const VALID_VIN = '1HGCM82633A004352'
const BAD_CHECK_DIGIT_VIN = '1HGCM82633A004353'

const authState = vi.hoisted(() => ({
  session: {
    user: { id: 'user-1', email: 'csr@example.com' },
    access_token: 'test-token',
  } as unknown as null | { user: { id: string; email: string }; access_token: string },
}))

vi.mock('../../lib/supabase.ts', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: authState.session }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: () => Promise.resolve({ data: {}, error: null }),
      signOut: () => Promise.resolve({ error: null }),
    },
  },
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  authState.session = {
    user: { id: 'user-1', email: 'csr@example.com' },
    access_token: 'test-token',
  }
})

describe('VinToolPanel', () => {
  it('finds a valid VIN from pasted text', async () => {
    const user = userEvent.setup()
    render(<VinToolPanel open onClose={() => {}} />)

    await user.type(screen.getByLabelText(/paste text containing a vin/i), `some text ${VALID_VIN} more text`)
    await user.click(screen.getByRole('button', { name: /find vins/i }))

    expect(await screen.findByText(VALID_VIN)).toBeInTheDocument()
    expect(screen.getByText(/check digit valid/i)).toBeInTheDocument()
  })

  it('shows invalid-check-digit feedback for a bad VIN typed manually', async () => {
    const user = userEvent.setup()
    render(<VinToolPanel open onClose={() => {}} />)

    await user.type(screen.getByLabelText(/^vin$/i), BAD_CHECK_DIGIT_VIN)

    expect(await screen.findByText(/check digit not valid/i)).toBeInTheDocument()
  })

  it('decodes a VIN using an injected fetch and renders make/model', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        Count: 1,
        Message: 'Results returned successfully',
        SearchCriteria: `Vin:${VALID_VIN}`,
        Results: [
          {
            Make: 'Honda',
            Model: 'Accord',
            ModelYear: '2003',
            Trim: 'EX',
            BodyClass: 'Sedan',
            VehicleType: 'Passenger Car',
            Manufacturer: 'Honda',
            PlantCountry: 'United States',
            EngineCylinders: '4',
            DisplacementL: '2.4',
            FuelTypePrimary: 'Gasoline',
            ErrorCode: '0',
            ErrorText: '',
          },
        ],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<VinToolPanel open onClose={() => {}} />)

    await user.type(screen.getByLabelText(/^vin$/i), VALID_VIN)
    await user.click(screen.getByRole('button', { name: /^decode$/i }))

    expect(await screen.findByText('Accord')).toBeInTheDocument()
    expect(screen.getAllByText('Honda').length).toBeGreaterThan(0)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(VALID_VIN))
  })

  it('closes the drawer on Escape and returns focus to the toggle', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: /front desk/i })

    const toggle = screen.getByRole('button', { name: /^vin tool$/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByRole('heading', { name: /^vin tool$/i })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveFocus()
    expect(screen.queryByRole('heading', { name: /^vin tool$/i })).not.toBeInTheDocument()
  })
})
