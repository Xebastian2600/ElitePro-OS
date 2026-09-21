import { describe, expect, it, vi } from 'vitest'
import { createHttpKbClient, parseKbResponse } from './httpClient.ts'
import { KbResponseError } from './types.ts'

describe('parseKbResponse', () => {
  it('drops malformed sources (missing id/title, wrong types)', () => {
    const result = parseKbResponse({
      answer: 'Some answer',
      sources: [
        { id: 's1', title: 'Good source' },
        { id: 's2' }, // missing title
        { title: 'No id' }, // missing id
        { id: 123, title: 'Bad id type' },
        'not an object',
        null,
      ],
    })
    expect(result.sources).toEqual([
      { id: 's1', title: 'Good source', url: null, section: null, category: null, updated_at: null, excerpt: null },
    ])
  })

  it('returns answer: null when the answer is non-empty but there are zero valid sources', () => {
    const result = parseKbResponse({ answer: 'An ungrounded answer', sources: [{ id: 's1' }] })
    expect(result.answer).toBeNull()
    expect(result.sources).toEqual([])
  })

  it('keeps the answer when there is at least one valid source', () => {
    const result = parseKbResponse({ answer: 'Grounded answer', sources: [{ id: 's1', title: 'Source' }] })
    expect(result.answer).toBe('Grounded answer')
  })

  it('maps an unknown category to null', () => {
    const result = parseKbResponse({ answer: null, sources: [{ id: 's1', title: 'T', category: 'bogus' }] })
    expect(result.sources[0].category).toBeNull()
  })

  it('keeps a known category', () => {
    const result = parseKbResponse({ answer: null, sources: [{ id: 's1', title: 'T', category: 'adas' }] })
    expect(result.sources[0].category).toBe('adas')
  })

  it('handles a completely malformed body', () => {
    expect(parseKbResponse(null)).toEqual({ answer: null, sources: [] })
    expect(parseKbResponse('nope')).toEqual({ answer: null, sources: [] })
    expect(parseKbResponse({})).toEqual({ answer: null, sources: [] })
  })

  it('treats an empty-string answer as null', () => {
    const result = parseKbResponse({ answer: '   ', sources: [{ id: 's1', title: 'T' }] })
    expect(result.answer).toBeNull()
  })
})

describe('createHttpKbClient', () => {
  it('sends a POST with the JSON body and a bearer token header', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ answer: null, sources: [] }), { status: 200 }))
    const client = createHttpKbClient({
      url: 'https://kb.example.com/search',
      getAccessToken: async () => 'tok_123',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await client.search({ query: 'ADAS 2019 Honda Civic', categories: ['adas'], context: { vin: '123' } })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://kb.example.com/search')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok_123')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({
      query: 'ADAS 2019 Honda Civic',
      categories: ['adas'],
      context: { vin: '123' },
    })
  })

  it('omits the Authorization header when there is no token', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ answer: null, sources: [] }), { status: 200 }))
    const client = createHttpKbClient({
      url: 'https://kb.example.com/search',
      getAccessToken: async () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await client.search({ query: 'q', categories: [] })

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('throws KbResponseError on a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => new Response('Server error', { status: 500 }))
    const client = createHttpKbClient({ url: 'https://kb.example.com/search', fetchImpl: fetchImpl as unknown as typeof fetch })

    await expect(client.search({ query: 'q', categories: [] })).rejects.toBeInstanceOf(KbResponseError)
  })

  it('parses a well-formed successful response', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            answer: 'ADAS calibration info',
            sources: [{ id: 's1', title: 'ADAS Guide', url: 'https://kb.example.com/adas', category: 'adas' }],
          }),
          { status: 200 },
        ),
    )
    const client = createHttpKbClient({ url: 'https://kb.example.com/search', fetchImpl: fetchImpl as unknown as typeof fetch })

    const result = await client.search({ query: 'ADAS', categories: ['adas'] })
    expect(result.answer).toBe('ADAS calibration info')
    expect(result.sources).toHaveLength(1)
  })

  it('reports available: true', () => {
    const client = createHttpKbClient({ url: 'https://kb.example.com/search' })
    expect(client.available).toBe(true)
  })
})
