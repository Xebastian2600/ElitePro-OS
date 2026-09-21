// KB client factory. There is no knowledge base in this repo — when
// VITE_KB_SEARCH_URL is unset, callers get an "unavailable" client so the
// app degrades gracefully instead of fabricating answers.

import type { KbClient } from './types.ts'
import { KbUnavailableError } from './types.ts'
import { createHttpKbClient } from './httpClient.ts'

export function createUnavailableKbClient(): KbClient {
  return {
    available: false,
    search() {
      return Promise.reject(new KbUnavailableError())
    },
  }
}

let cachedClient: KbClient | null = null

// Lazily imports ../lib/supabase.ts only when a real search runs against a configured
// backend, so importing this module never requires Supabase env vars to be set.
export function getKbClient(): KbClient {
  if (cachedClient) return cachedClient

  const url = import.meta.env.VITE_KB_SEARCH_URL
  if (!url) {
    cachedClient = createUnavailableKbClient()
    return cachedClient
  }

  cachedClient = createHttpKbClient({
    url,
    getAccessToken: async () => {
      const { supabase } = await import('../lib/supabase.ts')
      const { data } = await supabase.auth.getSession()
      return data.session?.access_token ?? null
    },
  })
  return cachedClient
}
