import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth.tsx'
import { recordFollowUpOutcome, updateFollowUp, cancelFollowUp } from '../../data/followUps.ts'
import { ValidationError } from '../../data/errors.ts'
import { dueState, snoozeUntil, type SnoozeOption } from '../../followup/due.ts'
import type { FollowUpOutcome, FollowUpWithSource } from '../../followup/types.ts'
import type { TeamMember } from '../../data/team.ts'
import { JOB_STATUSES, LEAD_STATUSES } from '../../shared/types.ts'
import { QUOTE_STATUSES } from '../../quote/types.ts'
import { StatusBadge, statusTone, type StatusTone } from '../ui/StatusBadge.tsx'
import { Button } from '../ui/Button.tsx'
import { TextField } from '../ui/TextField.tsx'
import { FormError } from '../ui/FormError.tsx'

export interface FollowUpRowProps {
  followUp: FollowUpWithSource
  teamMembers?: TeamMember[]
  now?: Date
  // Called after any successful mutation (outcome recorded, edited, cancelled).
  onChanged: () => void
}

const SOURCE_TYPE_LABEL: Record<FollowUpWithSource['source']['type'], string> = {
  lead: 'Lead',
  quote: 'Quote',
  job: 'Job',
}

const DUE_STATE_LABEL = { overdue: 'Overdue', due_today: 'Due today', upcoming: 'Upcoming' } as const
const DUE_STATE_TONE: Record<'overdue' | 'due_today' | 'upcoming', StatusTone> = {
  overdue: 'error',
  due_today: 'warning',
  upcoming: 'info',
}

const SNOOZE_OPTIONS: { value: SnoozeOption; label: string }[] = [
  { value: '1h', label: '1 hour' },
  { value: 'tomorrow_9am', label: 'Tomorrow 9am' },
  { value: '3d', label: '3 days' },
]

function sourceStatusLabel(type: FollowUpWithSource['source']['type'], status: string): string {
  const options = type === 'job' ? JOB_STATUSES : type === 'quote' ? QUOTE_STATUSES : LEAD_STATUSES
  return options.find((s) => s.value === status)?.label ?? status
}

function formatDue(iso: string): string {
  const date = new Date(iso)
  if (isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function isoToLocalInput(iso: string): string {
  const date = new Date(iso)
  if (isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

type Panel = null | 'lost' | 'snooze' | 'edit'

export function FollowUpRow({ followUp, teamMembers, now = new Date(), onChanged }: FollowUpRowProps) {
  const { user } = useAuth()
  const [panel, setPanel] = useState<Panel>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [lostReason, setLostReason] = useState('')
  const [lostReasonError, setLostReasonError] = useState<string | null>(null)

  const [editAction, setEditAction] = useState(followUp.action)
  const [editDueAt, setEditDueAt] = useState(() => isoToLocalInput(followUp.due_at))
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})

  const state = dueState(followUp.due_at, now)

  const ownerLabel =
    followUp.owner_id == null
      ? 'Unassigned'
      : followUp.owner_id === user?.id
        ? 'You'
        : (teamMembers?.find((m) => m.id === followUp.owner_id)?.email ?? 'Team member')

  function resetPanels() {
    setPanel(null)
    setError(null)
    setLostReason('')
    setLostReasonError(null)
    setEditErrors({})
  }

  async function handleOutcome(outcome: Exclude<FollowUpOutcome, 'lost' | 'snoozed'>) {
    setBusy(true)
    setError(null)
    try {
      await recordFollowUpOutcome(followUp.id, { outcome })
      resetPanels()
      onChanged()
    } catch (err) {
      if (err instanceof ValidationError) setError(Object.values(err.errors)[0] ?? 'Could not record this outcome.')
      else setError('Could not record this outcome. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirmLost() {
    if (lostReason.trim() === '') {
      setLostReasonError('Lost reason is required.')
      return
    }
    setBusy(true)
    setError(null)
    setLostReasonError(null)
    try {
      await recordFollowUpOutcome(followUp.id, { outcome: 'lost', lost_reason: lostReason })
      resetPanels()
      onChanged()
    } catch (err) {
      if (err instanceof ValidationError) {
        setLostReasonError(err.errors.lost_reason ?? null)
        setError(err.errors._ ?? Object.values(err.errors)[0] ?? null)
      } else {
        setError('Could not record this outcome. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleSnooze(option: SnoozeOption) {
    setBusy(true)
    setError(null)
    try {
      const until = snoozeUntil(option, now).toISOString()
      await recordFollowUpOutcome(followUp.id, { outcome: 'snoozed', snooze_until: until })
      resetPanels()
      onChanged()
    } catch (err) {
      if (err instanceof ValidationError) setError(Object.values(err.errors)[0] ?? 'Could not snooze this follow-up.')
      else setError('Could not snooze this follow-up. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveEdit() {
    setBusy(true)
    setEditErrors({})
    try {
      const due_at = editDueAt ? new Date(editDueAt).toISOString() : ''
      await updateFollowUp(followUp.id, { action: editAction, due_at })
      resetPanels()
      onChanged()
    } catch (err) {
      if (err instanceof ValidationError) setEditErrors(err.errors)
      else setEditErrors({ _: 'Could not save changes. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  async function handleCancelFollowUp() {
    if (!window.confirm('Cancel this follow-up?')) return
    setBusy(true)
    setError(null)
    try {
      await cancelFollowUp(followUp.id)
      onChanged()
    } catch {
      setError('Could not cancel this follow-up. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card-soft stack-sm">
      <div className="row-between">
        <div className="stack-sm" style={{ gap: 'var(--space-xxs)' }}>
          <div className="row" style={{ gap: 'var(--space-xs)' }}>
            <Link to={followUp.source.href} className="text-body-md link-plain" style={{ textDecoration: 'none', fontWeight: 600 }}>
              {SOURCE_TYPE_LABEL[followUp.source.type]} · {followUp.source.customer_name ?? 'No customer'}
            </Link>
            <StatusBadge
              label={sourceStatusLabel(followUp.source.type, followUp.source.status)}
              tone={statusTone(followUp.source.status)}
            />
          </div>
          <div className="text-body-sm">{followUp.action}</div>
          <div className="row" style={{ gap: 'var(--space-xs)' }}>
            <StatusBadge label={DUE_STATE_LABEL[state]} tone={DUE_STATE_TONE[state]} />
            <span className="text-caption">{formatDue(followUp.due_at)}</span>
          </div>
          <div className="text-caption">Owner: {ownerLabel}</div>
        </div>

        <div className="stack-sm" style={{ alignItems: 'flex-end', gap: 'var(--space-xs)' }}>
          <div className="row">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => handleOutcome('contacted')}>
              Contacted
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => handleOutcome('booked')}>
              Booked
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => (panel === 'lost' ? resetPanels() : setPanel('lost'))}
            >
              Lost
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => (panel === 'snooze' ? resetPanels() : setPanel('snooze'))}
            >
              Snooze
            </Button>
          </div>
          <div className="row">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => (panel === 'edit' ? resetPanels() : setPanel('edit'))}
            >
              Edit
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={handleCancelFollowUp}>
              Cancel follow-up
            </Button>
          </div>
        </div>
      </div>

      <FormError message={error} />

      {panel === 'lost' ? (
        <div className="stack-sm" style={{ borderTop: '1px solid var(--color-hairline)', paddingTop: 'var(--space-sm)' }}>
          <TextField
            label="Lost reason"
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            error={lostReasonError}
            required
          />
          <div className="row">
            <Button type="button" size="sm" disabled={busy} onClick={handleConfirmLost}>
              Confirm lost
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={resetPanels}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {panel === 'snooze' ? (
        <div className="stack-sm" style={{ borderTop: '1px solid var(--color-hairline)', paddingTop: 'var(--space-sm)' }}>
          <div className="row">
            {SNOOZE_OPTIONS.map((opt) => (
              <Button key={opt.value} type="button" variant="outline" size="sm" disabled={busy} onClick={() => handleSnooze(opt.value)}>
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {panel === 'edit' ? (
        <div className="stack-sm" style={{ borderTop: '1px solid var(--color-hairline)', paddingTop: 'var(--space-sm)' }}>
          <FormError message={editErrors._} />
          <TextField label="Action" value={editAction} onChange={(e) => setEditAction(e.target.value)} error={editErrors.action} />
          <TextField
            label="Due"
            type="datetime-local"
            value={editDueAt}
            onChange={(e) => setEditDueAt(e.target.value)}
            error={editErrors.due_at}
          />
          <div className="row">
            <Button type="button" size="sm" disabled={busy} onClick={handleSaveEdit}>
              Save
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={resetPanels}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
