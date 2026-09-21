import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/ui/PageHeader.tsx'
import { Button } from '../components/ui/Button.tsx'
import { CustomerSearch } from '../components/customer/CustomerSearch.tsx'
import { CustomerForm } from '../components/customer/CustomerForm.tsx'

export function CustomersPage() {
  const navigate = useNavigate()
  const [showNewCustomer, setShowNewCustomer] = useState(false)

  return (
    <div>
      <PageHeader
        title="Customers"
        actions={
          <Button type="button" onClick={() => setShowNewCustomer((v) => !v)}>
            {showNewCustomer ? 'Cancel' : 'New customer'}
          </Button>
        }
      />
      <div className="container page stack-lg">
        {showNewCustomer ? (
          <div className="card">
            <h2 className="text-heading-sm" style={{ marginBottom: 'var(--space-md)' }}>
              New customer
            </h2>
            <CustomerForm
              onSaved={(customer) => navigate(`/customers/${customer.id}`)}
              onCancel={() => setShowNewCustomer(false)}
              onUseExisting={(customer) => navigate(`/customers/${customer.id}`)}
            />
          </div>
        ) : null}
        <CustomerSearch />
      </div>
    </div>
  )
}
