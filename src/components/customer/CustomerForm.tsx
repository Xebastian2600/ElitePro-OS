import { useState, type FormEvent } from 'react'
import type { Customer, CustomerInput } from '../../shared/types.ts'
import { createCustomer, updateCustomer } from '../../data/customers.ts'
import { DuplicateError, ValidationError } from '../../data/errors.ts'
import { TextField } from '../ui/TextField.tsx'
import { TextArea } from '../ui/TextArea.tsx'
import { Button } from '../ui/Button.tsx'
import { FormError } from '../ui/FormError.tsx'
import { CustomerMatchNotice } from './CustomerMatchNotice.tsx'

export interface CustomerFormProps {
  initial?: Customer
  onSaved: (customer: Customer) => void
  onCancel?: () => void
  onUseExisting?: (customer: Customer) => void
}

export function CustomerForm({ initial, onSaved, onCancel, onUseExisting }: CustomerFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [duplicate, setDuplicate] = useState<Customer | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setErrors({})
    setDuplicate(null)

    const input: CustomerInput = { name, phone, email, address, notes }

    try {
      const saved = initial ? await updateCustomer(initial.id, input) : await createCustomer(input)
      onSaved(saved)
    } catch (err) {
      if (err instanceof ValidationError) {
        setErrors(err.errors)
      } else if (err instanceof DuplicateError) {
        if (err.existing) {
          setDuplicate(err.existing as Customer)
        } else {
          setErrors({ [err.field]: err.message })
        }
      } else {
        setErrors({ _: 'Something went wrong saving this customer. Try again.' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit} noValidate>
      <FormError message={errors._} />
      {duplicate ? (
        <CustomerMatchNotice
          customer={duplicate}
          message="A customer with this phone or email already exists:"
          onUse={(customer) => onUseExisting?.(customer)}
        />
      ) : null}
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required />
      <div className="grid-2">
        <TextField
          label="Phone"
          type="tel"
          value={phone ?? ''}
          onChange={(e) => setPhone(e.target.value)}
          error={errors.phone}
          placeholder="(555) 123-4567"
        />
        <TextField
          label="Email"
          type="email"
          value={email ?? ''}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          placeholder="name@example.com"
        />
      </div>
      <TextField
        label="Address"
        value={address ?? ''}
        onChange={(e) => setAddress(e.target.value)}
        error={errors.address}
      />
      <TextArea label="Notes" value={notes ?? ''} onChange={(e) => setNotes(e.target.value)} error={errors.notes} />
      <div className="row">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save customer'}
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
