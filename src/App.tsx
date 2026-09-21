import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, RequireAuth, useAuth } from './lib/auth.tsx'
import { Button } from './components/ui/Button.tsx'
import { HomePage } from './pages/HomePage.tsx'
import { CustomersPage } from './pages/CustomersPage.tsx'
import { CustomerDetailPage } from './pages/CustomerDetailPage.tsx'
import { LeadsPage } from './pages/LeadsPage.tsx'
import { LeadIntakePage } from './pages/LeadIntakePage.tsx'
import { LeadDetailPage } from './pages/LeadDetailPage.tsx'
import { JobsPage } from './pages/JobsPage.tsx'
import { JobDetailPage } from './pages/JobDetailPage.tsx'
import { QuotesPage } from './pages/QuotesPage.tsx'
import { QuoteNewPage } from './pages/QuoteNewPage.tsx'
import { QuoteWorkspacePage } from './pages/QuoteWorkspacePage.tsx'
import { PricingSettingsPage } from './pages/PricingSettingsPage.tsx'
import { CommandCenterPage } from './pages/CommandCenterPage.tsx'
import { FollowUpsPage } from './pages/FollowUpsPage.tsx'
import { ActivityPage } from './pages/ActivityPage.tsx'
import { IntegrationsPage } from './pages/IntegrationsPage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import './styles/base.css'

function AppHeader() {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  // Escape closes the open menu and returns focus to the toggle, so keyboard
  // users aren't left inside a menu they can't dismiss.
  useEffect(() => {
    if (!menuOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  return (
    <header className="nav-bar">
      <div className="container nav-bar__inner">
        <Link to="/" className="nav-bar__brand">
          ElitePro OS
        </Link>
        <button
          ref={toggleRef}
          type="button"
          className="nav-bar__menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="primary-nav"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true">{menuOpen ? '✕' : '☰'}</span>
        </button>
        <nav
          id="primary-nav"
          className={`nav-bar__links${menuOpen ? ' nav-bar__links--open' : ''}`}
          aria-label="Main"
        >
          <NavLink to="/command-center">Command Center</NavLink>
          <NavLink to="/customers">Customers</NavLink>
          <NavLink to="/leads">Leads</NavLink>
          <NavLink to="/jobs">Jobs</NavLink>
          <NavLink to="/quotes">Quotes</NavLink>
          <NavLink to="/follow-ups">Follow-ups</NavLink>
          <NavLink to="/activity">Activity</NavLink>
          <NavLink to="/integrations">Integrations</NavLink>
          <NavLink to="/settings/pricing">Pricing</NavLink>
        </nav>
        <div className="nav-bar__user">
          <span className="nav-bar__user-email">{user?.email}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  )
}

// Route table without a Router wrapper, so tests can mount it inside a
// MemoryRouter while the real app uses BrowserRouter (see App below).
export function AppRoutes() {
  return (
    <AuthProvider>
      <RequireAuth>
        <div className="app-shell">
          <AppHeader />
          <main style={{ flex: 1 }}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/command-center" element={<CommandCenterPage />} />
              <Route path="/follow-ups" element={<FollowUpsPage />} />
              <Route path="/activity" element={<ActivityPage />} />
              <Route path="/integrations" element={<IntegrationsPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/customers/:id" element={<CustomerDetailPage />} />
              <Route path="/leads" element={<LeadsPage />} />
              <Route path="/leads/new" element={<LeadIntakePage />} />
              <Route path="/leads/:id" element={<LeadDetailPage />} />
              <Route path="/jobs" element={<JobsPage />} />
              <Route path="/jobs/:id" element={<JobDetailPage />} />
              <Route path="/quotes" element={<QuotesPage />} />
              <Route path="/quotes/new" element={<QuoteNewPage />} />
              <Route path="/quotes/:id" element={<QuoteWorkspacePage />} />
              <Route path="/settings/pricing" element={<PricingSettingsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </main>
        </div>
      </RequireAuth>
    </AuthProvider>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App
