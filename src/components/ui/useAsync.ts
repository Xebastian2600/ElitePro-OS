import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: unknown
  reload: () => void
}

// Runs `fn` whenever `deps` change and tracks loading/error/data state.
// Guards against setting state after unmount or after a newer call has started.
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const callId = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    const id = ++callId.current
    setLoading(true)
    setError(null)
    fn()
      .then((result) => {
        if (!mounted.current || id !== callId.current) return
        setData(result)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (!mounted.current || id !== callId.current) return
        setError(err)
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken])

  const reload = useCallback(() => setReloadToken((n) => n + 1), [])

  return { data, loading, error, reload }
}
