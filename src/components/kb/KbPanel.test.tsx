import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KbPanel } from './KbPanel.tsx'
import type { KbSearchResult } from '../../kb/types.ts'

const searchMock = vi.hoisted(() => vi.fn())
const clientState = vi.hoisted(() => ({ available: true }))

vi.mock('../../kb/client.ts', () => ({
  getKbClient: () => ({
    available: clientState.available,
    search: searchMock,
  }),
}))

afterEach(() => {
  cleanup()
  searchMock.mockReset()
  clientState.available = true
})

describe('KbPanel', () => {
  it('shows a not-connected message and no results when the KB client is unavailable', () => {
    clientState.available = false
    render(<KbPanel />)

    expect(screen.getByText(/knowledge base not connected/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^search$/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/no kb results/i)).not.toBeInTheDocument()
  })

  it('shows the answer and source titles when the client returns results', async () => {
    const result: KbSearchResult = {
      answer: 'Use OEM glass for ADAS-equipped vehicles.',
      sources: [
        {
          id: 'src-1',
          title: 'ADAS calibration policy',
          url: null,
          section: 'Policy',
          category: 'adas',
          updated_at: '2024-01-01T00:00:00Z',
          excerpt: null,
        },
      ],
    }
    searchMock.mockResolvedValue(result)

    const user = userEvent.setup()
    render(<KbPanel />)

    await user.type(screen.getByLabelText(/search the knowledge base/i), 'ADAS windshield')
    await user.click(screen.getByRole('button', { name: /^search$/i }))

    expect(await screen.findByText('Use OEM glass for ADAS-equipped vehicles.')).toBeInTheDocument()
    expect(screen.getByText('ADAS calibration policy')).toBeInTheDocument()
  })

  it('shows a sources-only note when the answer is null but sources exist', async () => {
    const result: KbSearchResult = {
      answer: null,
      sources: [
        {
          id: 'src-1',
          title: 'Glass type reference',
          url: null,
          section: null,
          category: 'glass',
          updated_at: null,
          excerpt: null,
        },
      ],
    }
    searchMock.mockResolvedValue(result)

    const user = userEvent.setup()
    render(<KbPanel />)

    await user.type(screen.getByLabelText(/search the knowledge base/i), 'glass type')
    await user.click(screen.getByRole('button', { name: /^search$/i }))

    expect(await screen.findByText(/no direct answer/i)).toBeInTheDocument()
    expect(screen.getByText('Glass type reference')).toBeInTheDocument()
  })

  it('toggles category pills and includes the selection in the search request', async () => {
    searchMock.mockResolvedValue({ answer: null, sources: [] })
    const user = userEvent.setup()
    render(<KbPanel />)

    const adasPill = screen.getByRole('button', { name: 'ADAS' })
    expect(adasPill).toHaveAttribute('aria-pressed', 'false')
    await user.click(adasPill)
    expect(adasPill).toHaveAttribute('aria-pressed', 'true')

    await user.type(screen.getByLabelText(/search the knowledge base/i), 'glass')
    await user.click(screen.getByRole('button', { name: /^search$/i }))

    await waitFor(() => expect(searchMock).toHaveBeenCalled())
    expect(searchMock.mock.calls[0][0]).toMatchObject({ query: 'glass', categories: ['adas'] })
  })
})
