import { useId, type InputHTMLAttributes } from 'react'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  label: string
}

export function Checkbox({ label, ...rest }: CheckboxProps) {
  const id = useId()
  return (
    <div className="checkbox-row">
      <input id={id} type="checkbox" {...rest} />
      <label htmlFor={id}>{label}</label>
    </div>
  )
}
