import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { consumeAuthMessage, login } from '../services/auth'
import './Login.css'

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 3l18 18M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-4.4M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18.4 18.4 0 0 1-4.1 4.9M6.1 6.1C3.6 7.8 2 12 2 12s3.5 7 10 7c1.5 0 2.9-.3 4.1-.9"
      />
    </svg>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const next = location.state?.from || '/admin/blocklist'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(
    () => location.state?.message || consumeAuthMessage(),
  )
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const result = await login(username, password)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    navigate(next, { replace: true })
  }

  return (
    <div className="login">
      <aside className="login__story">
        <img
          className="login__logo"
          src="/adsnitch-logo-dark.png?v=2"
          alt="AdSnitch, a Cleartrust product"
        />
        <h2>See a sus ad? Snitch on it.</h2>
        <p>Block the bad. Keep the page.</p>
        <p>Target unwanted ads by URL — without blocking the page itself.</p>
      </aside>

      <form className="login__card" onSubmit={handleSubmit}>
        <p className="eyebrow">Admin</p>
        <h1>Sign in</h1>
        <p className="login__lede">
          Only signed-in admins can add or delete blocklisted ad URLs.
        </p>

        <label htmlFor="username">Username</label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={busy}
        />

        <label htmlFor="password">Password</label>
        <div className="login__password">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
          <button
            type="button"
            className="login__eye"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            disabled={busy}
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>

        {error && (
          <p className="flash flash--error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary login__submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
