import { useId, type TextareaHTMLAttributes } from 'react'
import { FieldError } from './FieldError.tsx'

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string
  error?: string | null
}

export function TextArea({ label, error, required, ...rest }: TextAreaProps) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
        {required ? ' *' : ''}
      </label>
      <textarea
        id={id}
        className={`textarea${error ? ' has-error' : ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        required={required}
        {...rest}
      />
      <FieldError id={errorId} message={error} />
    </div>
  )
}
