import { useEffect, useState } from 'react'
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
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import './styles/base.css'

function AppHeader() {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <header className="nav-bar">
      <div className="container nav-bar__inner">
        <Link to="/" className="nav-bar__brand">
          ElitePro OS
        </Link>
        <button
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
          <NavLink to="/customers">Customers</NavLink>
          <NavLink to="/leads">Leads</NavLink>
          <NavLink to="/jobs">Jobs</NavLink>
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
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/customers/:id" element={<CustomerDetailPage />} />
              <Route path="/leads" element={<LeadsPage />} />
              <Route path="/leads/new" element={<LeadIntakePage />} />
              <Route path="/leads/:id" element={<LeadDetailPage />} />
              <Route path="/jobs" element={<JobsPage />} />
              <Route path="/jobs/:id" element={<JobDetailPage />} />
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
