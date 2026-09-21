import type { ReactNode } from 'react'

export interface EmptyStateProps {
  message: string
  action?: ReactNode
}

export function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <p className="text-body-md">{message}</p>
      {action ? <div style={{ marginTop: 'var(--space-md)' }}>{action}</div> : null}
    </div>
  )
}
