// Sanitization for user-typed search text before it's interpolated into a
// PostgREST `.or()` / `.ilike()` filter string. PostgREST's filter DSL treats
// `,`, `(`, `)`, `"`, `\`, `:`, and `*` as structural characters, and `%` is
// the ilike wildcard — left in place, any of these let a search term break
// out of the intended filter (e.g. "Honda, Civic" injecting an extra
// condition) or blow up the request entirely.

const RESERVED_CHARS_RE = /[,()"\\:*%]/g

export function sanitizeSearchTerm(raw: string): string {
  return raw.replace(RESERVED_CHARS_RE, '').trim()
}

export function sanitizeSearchWords(raw: string): string[] {
  return raw
    .split(/\s+/)
    .map((word) => sanitizeSearchTerm(word))
    .filter((word) => word.length > 0)
}
