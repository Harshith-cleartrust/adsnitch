import { authHeaders, expireSession } from './auth'

async function request(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: authHeaders({
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    }),
  })
  if (res.status === 401) expireSession()
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { ok: false, error: data.error || 'Site request failed.', code: data.code || 'ERROR' }
  }
  return { ok: true, ...data }
}

export function listSites() {
  return request('/api/sites')
}

export function scriptForPolicy(policyId) {
  return request(`/api/sites/script?policy_id=${encodeURIComponent(policyId)}`)
}

export function createSite(body) {
  return request('/api/sites', { method: 'POST', body: JSON.stringify(body) })
}

export function regenerateSiteKey(domain) {
  return request(`/api/sites/${encodeURIComponent(domain)}/regenerate`, { method: 'POST' })
}

export function revokeSiteKey(domain) {
  return request(`/api/sites/${encodeURIComponent(domain)}/revoke`, { method: 'POST' })
}

export function assignSitePolicy(domain, policyId) {
  return request(`/api/sites/${encodeURIComponent(domain)}/policy`, {
    method: 'PATCH',
    body: JSON.stringify({ policy_id: policyId }),
  })
}
