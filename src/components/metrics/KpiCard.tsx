import { Link } from 'react-router-dom'

export interface KpiCardProps {
  label: string
  value: string | number
  sublabel?: string
  to?: string
  // 'error' tints the value text (e.g. overdue > 0) — everything else stays neutral ink.
  tone?: 'neutral' | 'error'
}

export function KpiCard({ label, value, sublabel, to, tone = 'neutral' }: KpiCardProps) {
  const valueClassName = `text-display-md${tone === 'error' ? ' text-error' : ''}`

  const content = (
    <>
      <div className={valueClassName}>{value}</div>
      <div className="text-body-sm text-mute">{label}</div>
      {sublabel ? <div className="text-caption">{sublabel}</div> : null}
    </>
  )

  if (to) {
    return (
      <Link to={to} className="tile" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        {content}
      </Link>
    )
  }

  return <div className="tile">{content}</div>
}
