export interface LoadingLineProps {
  label?: string
}

export function LoadingLine({ label = 'Loading…' }: LoadingLineProps) {
  return (
    <div className="loading-line" role="status" aria-live="polite">
      <span className="spinner-line" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}
