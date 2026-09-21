// Strips characters PostgREST's .or()/.ilike() filter DSL treats as structural (,()"\:*%)
// from user search text, so a term like "Honda, Civic" can't break out of the filter.

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
