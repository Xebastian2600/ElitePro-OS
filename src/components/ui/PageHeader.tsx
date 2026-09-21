import type { ReactNode } from 'react'

export interface PageHeaderProps {
  eyebrow?: string
  title: string
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="container">
        {eyebrow ? <div className="text-overline page-header__eyebrow">{eyebrow}</div> : null}
        <h1 className="page-header__title">{title}</h1>
        {actions ? <div className="page-header__actions">{actions}</div> : null}
      </div>
    </div>
  )
}
