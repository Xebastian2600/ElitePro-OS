import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { AdasStatus, Vehicle, VehicleInput, VerifiedStatus } from '../../shared/types.ts'
import { ADAS_STATUSES, VERIFIED_STATUSES } from '../../shared/types.ts'
import { createVehicle, updateVehicle } from '../../data/vehicles.ts'
import { DuplicateError, ValidationError } from '../../data/errors.ts'
import { isValidVin, normalizeVin } from '../../shared/validation.ts'
import { TextField } from '../ui/TextField.tsx'
import { TextArea } from '../ui/TextArea.tsx'
import { SelectField } from '../ui/SelectField.tsx'
import { Button } from '../ui/Button.tsx'
import { FormError } from '../ui/FormError.tsx'

const GLASS_TYPE_OPTIONS = ['Windshield', 'Back glass', 'Door glass', 'Quarter glass', 'Vent glass', 'Sunroof']

export interface VehicleFormProps {
  customerId: string
  initial?: Vehicle
  onSaved: (vehicle: Vehicle) => void
  onCancel?: () => void
}

export function VehicleForm({ customerId, initial, onSaved, onCancel }: VehicleFormProps) {
  const [year, setYear] = useState(initial?.year ? String(initial.year) : '')
  const [make, setMake] = useState(initial?.make ?? '')
  const [model, setModel] = useState(initial?.model ?? '')
  const [trim, setTrim] = useState(initial?.trim ?? '')
  const [vin, setVin] = useState(initial?.vin ?? '')
  const [glassType, setGlassType] = useState(initial?.glass_type ?? '')
  const [adasStatus, setAdasStatus] = useState<AdasStatus>(initial?.adas_status ?? 'unknown')
  const [verifiedStatus, setVerifiedStatus] = useState<VerifiedStatus>(initial?.verified_status ?? 'unverified')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [duplicate, setDuplicate] = useState<Vehicle | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const normalizedVin = normalizeVin(vin)
  const vinLiveError = vin.trim() !== '' && normalizedVin && normalizedVin.length === 17 && !isValidVin(normalizedVin)
    ? 'VIN must be 17 characters (letters and digits, no I, O, or Q).'
    : null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setErrors({})
    setDuplicate(null)

    const input: VehicleInput = {
      customer_id: customerId,
      year: year.trim() === '' ? null : Number(year),
      make,
      model,
      trim,
      vin,
      glass_type: glassType,
      adas_status: adasStatus,
      verified_status: verifiedStatus,
      notes,
    }

    try {
      const saved = initial ? await updateVehicle(initial.id, input) : await createVehicle(input)
      onSaved(saved)
    } catch (err) {
      if (err instanceof ValidationError) {
        setErrors(err.errors)
      } else if (err instanceof DuplicateError) {
        if (err.existing) {
          setDuplicate(err.existing as Vehicle)
        } else {
          setErrors({ [err.field]: err.message })
        }
      } else {
        setErrors({ _: 'Something went wrong saving this vehicle. Try again.' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit} noValidate>
      <FormError message={errors._} />
      {duplicate ? (
        <div className="match-notice" role="status">
          <div className="text-body-md">A vehicle with this VIN already exists.</div>
          <Link to={`/customers/${duplicate.customer_id}`} className="link-plain">
            View existing vehicle
          </Link>
        </div>
      ) : null}
      <div className="grid-2">
        <TextField label="Year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} error={errors.year} />
        <TextField
          label="VIN"
          value={vin}
          onChange={(e) => setVin(e.target.value.toUpperCase())}
          error={errors.vin ?? vinLiveError ?? undefined}
          maxLength={17}
          hint="17 characters, letters and digits, no I, O, or Q."
        />
      </div>
      <div className="grid-2">
        <TextField label="Make" value={make ?? ''} onChange={(e) => setMake(e.target.value)} error={errors.make} />
        <TextField label="Model" value={model ?? ''} onChange={(e) => setModel(e.target.value)} error={errors.model} />
      </div>
      <TextField label="Trim" value={trim ?? ''} onChange={(e) => setTrim(e.target.value)} error={errors.trim} />
      <div className="field">
        <label className="field-label" htmlFor="glass-type-input">
          Glass type
        </label>
        <input
          id="glass-type-input"
          className="input"
          list="glass-type-options"
          value={glassType ?? ''}
          onChange={(e) => setGlassType(e.target.value)}
        />
        <datalist id="glass-type-options">
          {GLASS_TYPE_OPTIONS.map((opt) => (
            <option key={opt} value={opt} />
          ))}
        </datalist>
      </div>
      <div className="grid-2">
        <SelectField
          label="ADAS status"
          value={adasStatus}
          onChange={(e) => setAdasStatus(e.target.value as AdasStatus)}
          options={ADAS_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
          error={errors.adas_status}
        />
        <SelectField
          label="Verified status"
          value={verifiedStatus}
          onChange={(e) => setVerifiedStatus(e.target.value as VerifiedStatus)}
          options={VERIFIED_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
          error={errors.verified_status}
        />
      </div>
      <TextArea label="Notes" value={notes ?? ''} onChange={(e) => setNotes(e.target.value)} error={errors.notes} />
      <div className="row">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save vehicle'}
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
