// Knowledge-base adapter contract. There is no knowledge base in this repo
// yet — this is only the boundary a future search backend plugs into. Never
// fabricate KB content anywhere in this codebase.

export type KbCategory = 'vehicle' | 'glass' | 'adas' | 'pricing' | 'insurance' | 'hcp' | 'scripts' | 'escalation'

export const KB_CATEGORIES: { value: KbCategory; label: string }[] = [
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'glass', label: 'Glass' },
  { value: 'adas', label: 'ADAS' },
  { value: 'pricing', label: 'Pricing' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'hcp', label: 'HCP' },
  { value: 'scripts', label: 'Scripts' },
  { value: 'escalation', label: 'Escalation' },
]

export interface KbSource {
  id: string
  title: string
  url: string | null
  section: string | null
  category: KbCategory | null
  updated_at: string | null
  excerpt: string | null
}

export interface KbSearchRequest {
  query: string
  categories: KbCategory[]
  context?: Record<string, string>
}

export interface KbSearchResult {
  answer: string | null
  sources: KbSource[]
}

export interface KbClient {
  readonly available: boolean
  search(req: KbSearchRequest, signal?: AbortSignal): Promise<KbSearchResult>
}

export class KbUnavailableError extends Error {
  constructor(message = 'Knowledge base search is not configured.') {
    super(message)
    this.name = 'KbUnavailableError'
  }
}

export class KbResponseError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'KbResponseError'
    this.status = status
  }
}
