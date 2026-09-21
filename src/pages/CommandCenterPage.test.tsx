import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommandCenterPage } from './CommandCenterPage.tsx'
import type { CommandCenterMetrics } from '../followup/types.ts'
import type { TodayBoard } from '../data/metrics.ts'
import { listActivityFeed } from '../data/activityFeed.ts'

vi.mock('../lib/auth.tsx', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'csr@example.com' }, session: null, loading: false, signOut: vi.fn() }),
}))

const getCommandCenterMetricsMock = vi.hoisted(() => vi.fn())
const listTodayBoardMock = vi.hoisted(() => vi.fn())

vi.mock('../data/metrics.ts', () => ({
  getCommandCenterMetrics: getCommandCenterMetricsMock,
  listTodayBoard: listTodayBoardMock,
}))

vi.mock('../data/team.ts', () => ({
  listTeamMembers: vi.fn(async () => []),
}))

vi.mock('../data/activityFeed.ts', () => ({
  listActivityFeed: vi.fn(async () => []),
}))

function metricsFixture(overrides: Partial<CommandCenterMetrics> = {}): CommandCenterMetrics {
  return {
    range: { period: 'today', start: '2024-06-15T00:00:00.000Z', end: '2024-06-16T00:00:00.000Z' },
    leads_created: 4,
    quotes_created: 2,
    quotes_open: 3,
    leads_booked: 1,
    jobs_created: 1,
    jobs_scheduled: 2,
    jobs_completed: 1,
    leads_open: 5,
    leads_lost: 1,
    follow_ups_overdue: 2,
    follow_ups_due_today: 3,
    follow_ups_open: 7,
    conversion_rate: 0.25,
    ...overrides,
  }
}

const emptyBoard: TodayBoard = { leadsToday: [], quotesOpen: [], jobsToday: [], followUpsDue: [] }

afterEach(() => {
  cleanup()
  getCommandCenterMetricsMock.mockReset()
  listTodayBoardMock.mockReset()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <CommandCenterPage />
    </MemoryRouter>,
  )
}

describe('CommandCenterPage', () => {
  it('renders mocked metric values exactly, including a percent conversion rate', async () => {
    getCommandCenterMetricsMock.mockResolvedValue(metricsFixture({ conversion_rate: 0.25 }))
    listTodayBoardMock.mockResolvedValue(emptyBoard)

    renderPage()

    expect(await screen.findByText('25%')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument() // leads_created
    expect(screen.getByText('3 open')).toBeInTheDocument() // quotes_open sublabel
  })

  it('renders "—" for a null conversion rate', async () => {
    getCommandCenterMetricsMock.mockResolvedValue(metricsFixture({ conversion_rate: null }))
    listTodayBoardMock.mockResolvedValue(emptyBoard)

    renderPage()

    expect(await screen.findByText('—')).toBeInTheDocument()
  })

  it('refetches metrics with the new period when a period pill is clicked', async () => {
    getCommandCenterMetricsMock.mockResolvedValue(metricsFixture())
    listTodayBoardMock.mockResolvedValue(emptyBoard)
    const user = userEvent.setup()

    renderPage()
    await screen.findByText('25%')
    expect(getCommandCenterMetricsMock).toHaveBeenCalledWith('today')

    await user.click(screen.getByRole('button', { name: '7 days' }))

    await waitFor(() => expect(getCommandCenterMetricsMock).toHaveBeenCalledWith('7d'))
  })

  it('Refresh reloads metrics, the board and recent activity', async () => {
    getCommandCenterMetricsMock.mockResolvedValue(metricsFixture())
    listTodayBoardMock.mockResolvedValue(emptyBoard)
    const user = userEvent.setup()

    renderPage()
    await screen.findByText('25%')
    await waitFor(() => expect(listActivityFeed).toHaveBeenCalled())
    const metricsCalls = getCommandCenterMetricsMock.mock.calls.length
    const boardCalls = listTodayBoardMock.mock.calls.length
    const activityCalls = vi.mocked(listActivityFeed).mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitFor(() => {
      expect(getCommandCenterMetricsMock.mock.calls.length).toBeGreaterThan(metricsCalls)
      expect(listTodayBoardMock.mock.calls.length).toBeGreaterThan(boardCalls)
      expect(vi.mocked(listActivityFeed).mock.calls.length).toBeGreaterThan(activityCalls)
    })
  })
})
