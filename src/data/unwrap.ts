import { DataError, toDataError } from './errors.ts'

interface Result<T> {
  data: T | null
  error: { code?: string; message?: string; details?: string | null; hint?: string | null } | null
}

export function unwrap<T>(result: Result<T>): T {
  if (result.error) throw toDataError(result.error)
  if (result.data == null) throw new DataError('No data returned.')
  return result.data
}
