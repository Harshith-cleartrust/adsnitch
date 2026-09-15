import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import SideNav from './components/SideNav'
import AdminBlocklist from './pages/AdminBlocklist'
import BlocklistPage from './pages/BlocklistPage'
import PolicyPage from './pages/PolicyPage'
import SitesPage from './pages/SitesPage'
import DemoPage from './pages/DemoPage'
import Login from './pages/Login'
import { getUsername, isLoggedIn, logout, verifySession } from './services/auth'
import './App.css'

function RequireAuth({ children }) {
  const location = useLocation()
  const [status, setStatus] = useState(() => (isLoggedIn() ? 'checking' : 'out'))

  useEffect(() => {
    let cancelled = false
    if (!isLoggedIn()) {
      setStatus('out')
      return undefined
    }
    verifySession().then((ok) => {
      if (!cancelled) setStatus(ok ? 'in' : 'out')
    })
    return () => {
      cancelled = true
    }
  }, [location.pathname])

  if (!isLoggedIn() || status === 'out') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (status === 'checking') return null
  return children
}

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const locationPath = location.pathname
  const [authed, setAuthed] = useState(isLoggedIn)
  const [username, setUsername] = useState(getUsername)

  useEffect(() => {
    const sync = () => {
      setAuthed(isLoggedIn())
      setUsername(getUsername())
    }
    window.addEventListener('adpage:auth-changed', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('adpage:auth-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const handleLogout = async () => {
    await logout()
    setAuthed(false)
    setUsername('')
    navigate('/login', { replace: true })
  }

  const showSideNav = locationPath !== '/login'

  return (
    <div className="app-shell">
      <div className="workspace">
      <nav className="topnav" aria-label="Primary">
        <NavLink to="/" className="topnav__brand" end>
          <img
            className="brand-mark"
            src="/adsnitch-mark.png"
            alt=""
          />
          <span className="topnav__identity">
            <span className="topnav__name">AdSnitch</span>
            <span className="topnav__tagline">Ad quality control for every page</span>
          </span>
        </NavLink>
        <div className="topnav__links">
          <NavLink
            to="/demo"
            className={({ isActive }) =>
              isActive ? 'topnav__link is-active' : 'topnav__link'
            }
          >
            Demo
          </NavLink>
          {authed ? (
            <>
              <span className="user-pill">{username || 'admin'}</span>
              <button type="button" className="topnav__link topnav__button" onClick={handleLogout}>
                Sign out
              </button>
            </>
          ) : (
            <NavLink
              to="/login"
              className={({ isActive }) =>
                isActive ? 'topnav__link is-active' : 'topnav__link'
              }
            >
              Sign in
            </NavLink>
          )}
        </div>
      </nav>

      <div className={`workspace__body ${showSideNav ? 'workspace--split' : ''}`}>
      {showSideNav && <SideNav />}
      <div className="app-body">
      <main>
        <Routes>
          <Route
            path="/"
            element={<Navigate to={authed ? '/admin/blocklist' : '/login'} replace />}
          />
          <Route
            path="/login"
            element={authed ? <Navigate to="/admin/blocklist" replace /> : <Login />}
          />
          <Route
            path="/blocklist"
            element={
              <RequireAuth>
                <BlocklistPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/blocklist"
            element={
              <RequireAuth>
                <AdminBlocklist />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/policy"
            element={
              <RequireAuth>
                <PolicyPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/sites"
            element={
              <RequireAuth>
                <SitesPage />
              </RequireAuth>
            }
          />
          <Route path="/demo" element={<DemoPage />} />
        </Routes>
      </main>
      </div>
      </div>
      </div>
    </div>
  )
}
