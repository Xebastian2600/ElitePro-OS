export type StatusTone = 'neutral' | 'success' | 'error' | 'warning' | 'info'

export interface StatusBadgeProps {
  label: string
  tone?: StatusTone
  // Use on a dark surface (e.g. inside the page-header band) so the label
  // text and outline stay legible instead of rendering black-on-black.
  onDark?: boolean
}

// Shared tone mapping for lead/job status values. Kept generic so it works for
// both LeadStatus and JobStatus since several values (booked, lost, follow_up)
// are shared between the two unions.
export function statusTone(status: string): StatusTone {
  switch (status) {
    case 'lost':
      return 'error'
    case 'booked':
    case 'completed':
      return 'success'
    case 'follow_up':
    case 'parts_needed':
      return 'warning'
    case 'in_progress':
    case 'scheduled':
    case 'quoted':
      return 'info'
    default:
      return 'neutral'
  }
}

export function StatusBadge({ label, tone = 'neutral', onDark }: StatusBadgeProps) {
  return (
    <span className={`badge badge-${tone}${onDark ? ' badge--on-dark' : ''}`}>
      <span className="badge__dot" aria-hidden="true" />
      {label}
    </span>
  )
}
