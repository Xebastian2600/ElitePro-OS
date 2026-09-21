import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../lib/auth.tsx'
import { createFollowUp } from '../../data/followUps.ts'
import { ValidationError } from '../../data/errors.ts'
import { listTeamMembers, type TeamMember } from '../../data/team.ts'
import type { FollowUp, FollowUpSourceType } from '../../followup/types.ts'
import { TextField } from '../ui/TextField.tsx'
import { TextArea } from '../ui/TextArea.tsx'
import { SelectField } from '../ui/SelectField.tsx'
import { Button } from '../ui/Button.tsx'
import { FormError } from '../ui/FormError.tsx'

export interface FollowUpFormProps {
  source: { type: FollowUpSourceType; id: string }
  onCreated: (followUp: FollowUp) => void
  onCancel?: () => void
}

function defaultDueAt(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000)
  d.setMinutes(0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function FollowUpForm({ source, onCreated, onCancel }: FollowUpFormProps) {
  const { user } = useAuth()
  const [action, setAction] = useState('')
  const [dueAt, setDueAt] = useState(defaultDueAt)
  const [ownerId, setOwnerId] = useState(user?.id ?? '')
  const [notes, setNotes] = useState('')
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    listTeamMembers()
      .then(setTeamMembers)
      .catch(() => setTeamMembers([]))
  }, [])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setErrors({})
    try {
      const followUp = await createFollowUp({
        [source.type === 'lead' ? 'lead_id' : source.type === 'quote' ? 'quote_id' : 'job_id']: source.id,
        action,
        due_at: dueAt ? new Date(dueAt).toISOString() : '',
        owner_id: ownerId || null,
        notes: notes || null,
      })
      onCreated(followUp)
    } catch (err) {
      if (err instanceof ValidationError) setErrors(err.errors)
      else setErrors({ _: 'Could not create this follow-up. Try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit} noValidate>
      <FormError message={errors._} />
      <TextField label="Action" value={action} onChange={(e) => setAction(e.target.value)} error={errors.action} required />
      <TextField
        label="Due"
        type="datetime-local"
        value={dueAt}
        onChange={(e) => setDueAt(e.target.value)}
        error={errors.due_at}
        required
      />
      <SelectField
        label="Owner"
        value={ownerId}
        onChange={(e) => setOwnerId(e.target.value)}
        options={teamMembers.map((m) => ({ value: m.id, label: m.id === user?.id ? `${m.email} (you)` : m.email }))}
        placeholder="Unassigned"
        error={errors.owner_id}
      />
      <TextArea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} error={errors.notes} />
      <div className="row">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add follow-up'}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  )
}
