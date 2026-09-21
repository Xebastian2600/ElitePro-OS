// Error types thrown by src/data/*.ts. Callers should catch these specific
// classes rather than inspect raw Postgres/PostgREST error shapes.

export class ValidationError extends Error {
  errors: Record<string, string>

  constructor(errors: Record<string, string>) {
    super(Object.values(errors)[0] ?? 'Validation failed.')
    this.name = 'ValidationError'
    this.errors = errors
  }
}

export class DuplicateError<T = unknown> extends Error {
  field: string
  existing?: T

  constructor(field: string, message: string, existing?: T) {
    super(message)
    this.name = 'DuplicateError'
    this.field = field
    this.existing = existing
  }
}

export class DataError extends Error {
  cause?: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'DataError'
    this.cause = cause
  }
}

interface PostgrestLikeError {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}

const FIELD_HINTS: Array<{ field: string; needles: string[] }> = [
  { field: 'phone', needles: ['phone'] },
  { field: 'email', needles: ['email'] },
  { field: 'vin', needles: ['vin'] },
  { field: 'quote_id', needles: ['quote_id'] },
]

function detectField(pgError: PostgrestLikeError): string {
  const haystack = `${pgError.message ?? ''} ${pgError.details ?? ''}`.toLowerCase()
  for (const { field, needles } of FIELD_HINTS) {
    if (needles.some((needle) => haystack.includes(needle))) return field
  }
  return 'unknown'
}

export function toDataError(pgError: PostgrestLikeError): ValidationError | DuplicateError | DataError {
  if (pgError.code === '23505') {
    const field = detectField(pgError)
    return new DuplicateError(field, pgError.message ?? `Duplicate ${field}.`)
  }
  if (pgError.code === '23514') {
    return new ValidationError({ _: pgError.message ?? 'Validation failed.' })
  }
  return new DataError(pgError.message ?? 'Unexpected database error.', pgError)
}
