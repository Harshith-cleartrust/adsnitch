/**
 * Shared Ad URL blocklist — talks to /api/blocklist.
 * Used by the React admin/demo. The embed script uses the same API.
 */

import { authHeaders, expireSession, isLoggedIn } from './auth'

function apiBase() {
  return ''
}

function adminHeaders() {
  return authHeaders({ 'Content-Type': 'application/json' })
}

export function normalizeAdUrl(raw) {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return ''

  let withProtocol = trimmed
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    withProtocol = `https://${trimmed}`
  }

  const parsed = new URL(withProtocol)
  parsed.hostname = parsed.hostname.toLowerCase()
  parsed.hash = ''

  let pathname = parsed.pathname
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1)
  }
  parsed.pathname = pathname || '/'

  return parsed.toString()
}

function isAllowedHostname(hostname) {
  const host = String(hostname || '').toLowerCase()
  if (!host) return false
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  return host.includes('.')
}

export function validateAdUrl(raw) {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) {
    return { ok: false, error: 'URL is required.' }
  }

  try {
    const normalized = normalizeAdUrl(trimmed)
    const parsed = new URL(normalized)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { ok: false, error: 'Only http and https URLs are allowed.' }
    }
    if (!isAllowedHostname(parsed.hostname)) {
      return { ok: false, error: 'Enter a valid URL with a hostname.' }
    }
    return { ok: true, url: normalized }
  } catch {
    return { ok: false, error: 'Invalid URL. Example: https://example.com/bad-ad' }
  }
}

const PAGE_LOAD_ID =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now())

const dismissedCatchLights = new Map()

export function isCatchLightDismissed(id) {
  return dismissedCatchLights.has(id)
}

export function dismissCatchLight(id, count) {
  dismissedCatchLights.set(id, Number(count) || 0)
}

export function syncDismissedCatchLights(entries) {
  const restored = []
  for (const entry of entries) {
    if (!dismissedCatchLights.has(entry.id)) continue
    if ((entry.caught_24h || 0) > dismissedCatchLights.get(entry.id)) {
      dismissedCatchLights.delete(entry.id)
      restored.push(entry.id)
    }
  }
  if (restored.length) {
    window.dispatchEvent(new CustomEvent('adpage:catch-lights-reset', { detail: restored }))
  }
}

function notifyChanged() {
  window.dispatchEvent(new CustomEvent('adpage:blocklist-changed'))
  try {
    const channel = new BroadcastChannel('adpage-blocklist')
    channel.postMessage('changed')
    channel.close()
  } catch {
    // Other tabs still pick this up on the next poll.
  }
}

/** Keep open blocklist tables in sync without a manual reload. */
export function subscribeBlocklist(onChange) {
  const refresh = () => onChange()
  let channel
  try {
    channel = new BroadcastChannel('adpage-blocklist')
    channel.addEventListener('message', refresh)
  } catch {
    channel = null
  }
  window.addEventListener('adpage:blocklist-changed', refresh)
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') refresh()
  }, 3000)
  const onVisible = () => {
    if (document.visibilityState === 'visible') refresh()
  }
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    clearInterval(timer)
    channel?.close()
    window.removeEventListener('adpage:blocklist-changed', refresh)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

/** Record that a blocklisted ad URL was caught. Fail open. */
export async function reportCaughtUrls(urls) {
  const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean)
  if (!list.length) return
  try {
    const res = await fetch(`${apiBase()}/api/blocklist/caught`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: list, page_load_id: PAGE_LOAD_ID }),
    })
    if (res.ok) notifyChanged()
  } catch (err) {
    console.error('[blocklist] Caught report failed', err)
  }
}

/** List all blocklisted URLs (newest first). Fail open → []. */
export async function listBlocklistedUrls() {
  try {
    const res = await fetch(`${apiBase()}/api/blocklist`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return Array.isArray(data.entries) ? data.entries : []
  } catch (err) {
    console.error('[blocklist] Failed to list', err)
    return []
  }
}

export async function addBlocklistedUrl(rawUrl) {
  if (!isLoggedIn()) {
    return { ok: false, error: 'Unauthorized. Admin access required.', code: 'UNAUTHORIZED' }
  }

  const validation = validateAdUrl(rawUrl)
  if (!validation.ok) {
    return { ok: false, error: validation.error, code: 'INVALID' }
  }

  try {
    const res = await fetch(`${apiBase()}/api/blocklist`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ url: validation.url }),
    })
    const data = await res.json()
    if (!res.ok) {
      if (res.status === 401 || res.status === 403 || data.code === 'UNAUTHORIZED') {
        expireSession()
      }
      return {
        ok: false,
        error:
          data.code === 'UNAUTHORIZED'
            ? 'Session expired. Sign in again.'
            : data.error || 'Failed to add URL.',
        code: data.code,
        entry: data.entry,
      }
    }
    notifyChanged()
    return { ok: true, entry: data.entry }
  } catch (err) {
    console.error('[blocklist] Add failed', err)
    return { ok: false, error: 'Could not reach blocklist API.', code: 'NETWORK' }
  }
}

export async function deleteBlocklistedUrl(id) {
  if (!isLoggedIn()) {
    return { ok: false, error: 'Unauthorized. Admin access required.', code: 'UNAUTHORIZED' }
  }

  try {
    const res = await fetch(`${apiBase()}/api/blocklist/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    })
    const data = await res.json()
    if (!res.ok) {
      if (res.status === 401 || res.status === 403 || data.code === 'UNAUTHORIZED') {
        expireSession()
      }
      return {
        ok: false,
        error:
          data.code === 'UNAUTHORIZED'
            ? 'Session expired. Sign in again.'
            : data.error || 'Failed to delete URL.',
        code: data.code,
      }
    }
    notifyChanged()
    return { ok: true }
  } catch (err) {
    console.error('[blocklist] Delete failed', err)
    return { ok: false, error: 'Could not reach blocklist API.', code: 'NETWORK' }
  }
}

export async function getBlocklistSnapshot(ads = []) {
  try {
    const res = await fetch(`${apiBase()}/api/blocklist/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ads: ads.map((ad) => ({
          url: ad.adUrl || ad.url,
          text: ad.text || ad.headline || '',
        })),
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const blocked = new Set()
    for (const row of data.results || []) {
      if (row.matched) blocked.add(row.input)
    }
    return blocked
  } catch (err) {
    console.error('[blocklist] Snapshot failed — allowing ads', err)
    return new Set()
  }
}

export function isAdUrlInSnapshot(adUrl, snapshot) {
  try {
    if (!adUrl || !snapshot) return false
    if (snapshot.has(adUrl)) return true
    const validation = validateAdUrl(adUrl)
    if (!validation.ok) return false
    return snapshot.has(validation.url)
  } catch (err) {
    console.error('[blocklist] Snapshot check failed — allowing ad', err)
    return false
  }
}
