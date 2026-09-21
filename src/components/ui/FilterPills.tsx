export interface FilterPillOption<T extends string> {
  value: T | 'all'
  label: string
}

export interface FilterPillsProps<T extends string> {
  options: FilterPillOption<T>[]
  value: T | 'all'
  onChange: (value: T | 'all') => void
  'aria-label'?: string
}

export function FilterPills<T extends string>({ options, value, onChange, ...rest }: FilterPillsProps<T>) {
  return (
    <div className="pills" role="group" aria-label={rest['aria-label'] ?? 'Filter'}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`pill${value === opt.value ? ' active' : ''}`}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
