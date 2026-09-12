const TOKEN_KEY = 'adpage_token'
const USER_KEY = 'adpage_user'

export function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function getUsername() {
  try {
    return sessionStorage.getItem(USER_KEY) || ''
  } catch {
    return ''
  }
}

export function isLoggedIn() {
  return Boolean(getToken())
}

export function authHeaders(extra = {}) {
  const headers = { ...extra }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function persistSession(token, username) {
  sessionStorage.setItem(TOKEN_KEY, token)
  sessionStorage.setItem(USER_KEY, username)
  window.dispatchEvent(new CustomEvent('adpage:auth-changed'))
}

export function expireSession() {
  try {
    sessionStorage.setItem('adpage_auth_message', 'Session expired. Sign in again.')
  } catch {
    // Still clear the dead session below.
  }
  clearSession()
}

export function consumeAuthMessage() {
  try {
    const message = sessionStorage.getItem('adpage_auth_message') || ''
    sessionStorage.removeItem('adpage_auth_message')
    return message
  } catch {
    return ''
  }
}

function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(USER_KEY)
  window.dispatchEvent(new CustomEvent('adpage:auth-changed'))
}

export async function login(username, password) {
  const name = String(username || '').trim()
  const pass = String(password || '')
  if (!name || !pass) {
    return { ok: false, error: 'Username and password are required.' }
  }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: name, password: pass }),
    })
    const data = await res.json()
    if (!res.ok || !data.token) {
      return { ok: false, error: data.error || 'Login failed.' }
    }
    persistSession(data.token, data.username || name)
    return { ok: true, username: data.username || name }
  } catch (err) {
    console.error('[auth] Login failed', err)
    return { ok: false, error: 'Could not reach the login server.' }
  }
}

export async function verifySession() {
  if (!isLoggedIn()) return false
  try {
    const res = await fetch('/api/session', { headers: authHeaders() })
    if (res.status === 401 || res.status === 403) {
      expireSession()
      return false
    }
    return res.ok
  } catch (err) {
    console.error('[auth] Session check failed', err)
    return isLoggedIn()
  }
}

export async function logout() {
  const token = getToken()
  clearSession()
  if (!token) return
  try {
    await fetch('/api/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch (err) {
    console.error('[auth] Logout request failed', err)
  }
}
