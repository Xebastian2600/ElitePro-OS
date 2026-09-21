import type { ReactNode } from 'react'

export interface SectionProps {
  title?: string
  actions?: ReactNode
  children: ReactNode
}

export function Section({ title, actions, children }: SectionProps) {
  return (
    <section className="section">
      {title || actions ? (
        <div className="row-between" style={{ marginBottom: 'var(--space-md)' }}>
          {title ? <h2 className="text-heading-sm">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  )
}
