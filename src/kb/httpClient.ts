// HTTP-backed KB client. Strictly validates the response shape before
// trusting it — a KB answer is never shown without at least one valid
// source (see parseKbResponse).

import type { KbCategory, KbClient, KbSearchRequest, KbSearchResult, KbSource } from './types.ts'
import { KB_CATEGORIES, KbResponseError } from './types.ts'

const KB_CATEGORY_VALUES: KbCategory[] = KB_CATEGORIES.map((c) => c.value)

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asCategory(value: unknown): KbCategory | null {
  return typeof value === 'string' && KB_CATEGORY_VALUES.includes(value as KbCategory) ? (value as KbCategory) : null
}

function parseSource(value: unknown): KbSource | null {
  if (!isPlainObject(value)) return null
  const { id, title } = value
  if (typeof id !== 'string' || id === '') return null
  if (typeof title !== 'string' || title === '') return null

  return {
    id,
    title,
    url: asNullableString(value.url),
    section: asNullableString(value.section),
    category: asCategory(value.category),
    updated_at: asNullableString(value.updated_at),
    excerpt: asNullableString(value.excerpt),
  }
}

// Exported for tests. Strictly parses an untrusted JSON body, dropping malformed sources.
// Grounding rule: a non-empty answer with zero valid sources is never shown — comes back null.
export function parseKbResponse(json: unknown): KbSearchResult {
  if (!isPlainObject(json)) return { answer: null, sources: [] }

  const rawSources = Array.isArray(json.sources) ? json.sources : []
  const sources = rawSources.map(parseSource).filter((s): s is KbSource => s !== null)

  const rawAnswer = typeof json.answer === 'string' ? json.answer.trim() : ''
  const answer = rawAnswer !== '' && sources.length > 0 ? rawAnswer : null

  return { answer, sources }
}

export interface CreateHttpKbClientArgs {
  url: string
  getAccessToken?: () => Promise<string | null>
  fetchImpl?: typeof fetch
}

export function createHttpKbClient(args: CreateHttpKbClientArgs): KbClient {
  const { url, getAccessToken, fetchImpl } = args
  const doFetch = fetchImpl ?? fetch

  return {
    available: true,
    async search(req: KbSearchRequest, signal?: AbortSignal): Promise<KbSearchResult> {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }

      const token = getAccessToken ? await getAccessToken() : null
      if (token) headers.Authorization = `Bearer ${token}`

      const body: KbSearchRequest = {
        query: req.query,
        categories: req.categories,
        ...(req.context !== undefined ? { context: req.context } : {}),
      }

      const response = await doFetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      })

      if (!response.ok) {
        throw new KbResponseError(`KB search failed with status ${response.status}.`, response.status)
      }

      let json: unknown
      try {
        json = await response.json()
      } catch {
        throw new KbResponseError('KB search returned an invalid JSON response.')
      }

      return parseKbResponse(json)
    },
  }
}
