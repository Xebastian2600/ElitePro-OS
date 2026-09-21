import { useState } from 'react'
import type { Customer } from '../../shared/types.ts'
import { searchCustomers } from '../../data/customers.ts'
import { useDebouncedValue } from '../ui/useDebouncedValue.ts'
import { useAsync } from '../ui/useAsync.ts'
import { TextField } from '../ui/TextField.tsx'
import { LoadingLine } from '../ui/LoadingLine.tsx'
import { EmptyState } from '../ui/EmptyState.tsx'
import { CustomerCard } from './CustomerCard.tsx'
import { Button } from '../ui/Button.tsx'

export interface CustomerSearchProps {
  onSelect?: (customer: Customer) => void
}

export function CustomerSearch({ onSelect }: CustomerSearchProps) {
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const { data, loading, error } = useAsync(() => searchCustomers(debounced), [debounced])

  return (
    <div className="stack">
      <TextField
        label="Search customers"
        placeholder="Search by name, phone, or email"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {loading ? <LoadingLine label="Searching…" /> : null}
      {error ? <div className="text-error text-body-sm">Could not load customers.</div> : null}
      {!loading && data && data.length === 0 ? <EmptyState message="No customers found." /> : null}
      {!loading && data && data.length > 0 ? (
        <div className="table-stack">
          {data.map((customer) => (
            <CustomerCard
              key={customer.id}
              customer={customer}
              compact
              actions={
                onSelect ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => onSelect(customer)}>
                    Select
                  </Button>
                ) : undefined
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
