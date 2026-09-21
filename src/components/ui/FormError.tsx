export interface FormErrorProps {
  message?: string | null
}

// Form-level error banner. Renders with role="alert" so screen readers announce it.
export function FormError({ message }: FormErrorProps) {
  if (!message) return null
  return (
    <div className="form-error" role="alert">
      {message}
    </div>
  )
}
