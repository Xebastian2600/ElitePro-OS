import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FollowUpRow, type FollowUpRowProps } from './FollowUpRow.tsx'
import { ValidationError } from '../../data/errors.ts'
import type { FollowUpWithSource } from '../../followup/types.ts'

vi.mock('../../lib/auth.tsx', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'csr@example.com' }, session: null, loading: false, signOut: vi.fn() }),
}))

const recordFollowUpOutcomeMock = vi.hoisted(() => vi.fn())
const updateFollowUpMock = vi.hoisted(() => vi.fn())
const cancelFollowUpMock = vi.hoisted(() => vi.fn())

vi.mock('../../data/followUps.ts', () => ({
  recordFollowUpOutcome: recordFollowUpOutcomeMock,
  updateFollowUp: updateFollowUpMock,
  cancelFollowUp: cancelFollowUpMock,
}))

const NOW = new Date('2024-06-15T12:00:00Z')

function makeFollowUp(overrides: Partial<FollowUpWithSource> = {}): FollowUpWithSource {
  return {
    id: 'fu-1',
    lead_id: 'lead-1',
    quote_id: null,
    job_id: null,
    due_at: '2024-06-15T09:00:00Z', // before NOW -> overdue
    action: 'Call about quote',
    status: 'open',
    owner_id: 'user-1',
    notes: null,
    outcome: null,
    completed_at: null,
    created_by: 'user-1',
    created_at: '2024-06-14T00:00:00Z',
    updated_at: '2024-06-14T00:00:00Z',
    source: { type: 'lead', id: 'lead-1', status: 'new', customer_name: 'Jane Doe', href: '/leads/lead-1' },
    ...overrides,
  }
}

function renderRow(props: FollowUpRowProps) {
  return render(
    <MemoryRouter>
      <FollowUpRow {...props} />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  recordFollowUpOutcomeMock.mockReset()
  updateFollowUpMock.mockReset()
  cancelFollowUpMock.mockReset()
})

describe('FollowUpRow', () => {
  it('renders the due state badge for an overdue follow-up', () => {
    renderRow({ followUp: makeFollowUp(), now: NOW, onChanged: () => {} })
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })

  it('renders "Due today" and "Upcoming" badges correctly', () => {
    const { unmount } = renderRow({ followUp: makeFollowUp({ due_at: '2024-06-15T18:00:00Z' }), now: NOW, onChanged: () => {} })
    expect(screen.getByText('Due today')).toBeInTheDocument()
    unmount()

    renderRow({ followUp: makeFollowUp({ due_at: '2024-06-20T09:00:00Z' }), now: NOW, onChanged: () => {} })
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
  })

  it('requires a lost reason before calling recordFollowUpOutcome with Lost', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    renderRow({ followUp: makeFollowUp(), now: NOW, onChanged })

    await user.click(screen.getByRole('button', { name: /^lost$/i }))
    await user.click(screen.getByRole('button', { name: /confirm lost/i }))

    expect(recordFollowUpOutcomeMock).not.toHaveBeenCalled()
    expect(await screen.findByText(/lost reason is required/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/lost reason/i), 'Went with a competitor')
    recordFollowUpOutcomeMock.mockResolvedValue({ followUp: makeFollowUp({ status: 'done' }), sourceUpdated: true })
    await user.click(screen.getByRole('button', { name: /confirm lost/i }))

    expect(recordFollowUpOutcomeMock).toHaveBeenCalledWith('fu-1', { outcome: 'lost', lost_reason: 'Went with a competitor' })
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('calls recordFollowUpOutcome with a snooze_until when a snooze option is chosen', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    recordFollowUpOutcomeMock.mockResolvedValue({ followUp: makeFollowUp(), sourceUpdated: false })
    renderRow({ followUp: makeFollowUp(), now: NOW, onChanged })

    await user.click(screen.getByRole('button', { name: /^snooze$/i }))
    await user.click(screen.getByRole('button', { name: /1 hour/i }))

    expect(recordFollowUpOutcomeMock).toHaveBeenCalledTimes(1)
    const [id, payload] = recordFollowUpOutcomeMock.mock.calls[0]
    expect(id).toBe('fu-1')
    expect(payload.outcome).toBe('snoozed')
    expect(payload.snooze_until).toBe(new Date('2024-06-15T13:00:00Z').toISOString())
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('shows a ValidationError message inline for a one-click outcome (e.g. an invalid quote transition)', async () => {
    const user = userEvent.setup()
    recordFollowUpOutcomeMock.mockRejectedValue(new ValidationError({ _: 'Quote cannot move to that status.' }))
    renderRow({ followUp: makeFollowUp(), now: NOW, onChanged: () => {} })

    await user.click(screen.getByRole('button', { name: /^booked$/i }))

    expect(await screen.findByText(/quote cannot move to that status/i)).toBeInTheDocument()
  })
})
