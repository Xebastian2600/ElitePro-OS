import { Link } from 'react-router-dom'
import { EmptyState } from '../components/ui/EmptyState.tsx'

export function NotFoundPage() {
  return (
    <div className="container page">
      <h1 className="text-heading-lg" style={{ marginBottom: 'var(--space-md)' }}>
        Page not found
      </h1>
      <EmptyState
        message="We couldn't find that page."
        action={
          <Link to="/" className="btn btn-outline btn-sm">
            Back to home
          </Link>
        }
      />
    </div>
  )
}
