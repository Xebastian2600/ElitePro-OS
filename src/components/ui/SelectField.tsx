import { useId, type ReactNode, type SelectHTMLAttributes } from 'react'
import { FieldError } from './FieldError.tsx'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string
  error?: string | null
  options: SelectOption[]
  placeholder?: string
  children?: ReactNode
}

export function SelectField({ label, error, options, placeholder, required, children, ...rest }: SelectFieldProps) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
        {required ? ' *' : ''}
      </label>
      <select
        id={id}
        className={`select${error ? ' has-error' : ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        required={required}
        {...rest}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
        {children}
      </select>
      <FieldError id={errorId} message={error} />
    </div>
  )
}
