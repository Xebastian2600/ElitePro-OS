import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/ui/PageHeader.tsx'
import { LeadIntakeForm } from '../components/lead/LeadIntakeForm.tsx'

export function LeadIntakePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const customerId = searchParams.get('customerId')

  return (
    <div>
      <PageHeader title="New lead" />
      <div className="container page">
        <LeadIntakeForm initialCustomerId={customerId} onCreated={(lead) => navigate(`/leads/${lead.id}`)} />
      </div>
    </div>
  )
}
