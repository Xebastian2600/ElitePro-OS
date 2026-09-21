export interface FieldErrorProps {
  id: string
  message?: string | null
}

export function FieldError({ id, message }: FieldErrorProps) {
  if (!message) return null
  return (
    <span id={id} className="field-error">
      {message}
    </span>
  )
}
