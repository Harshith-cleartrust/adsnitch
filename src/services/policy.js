import { authHeaders, expireSession } from './auth'

function notifyBlocklistChanged() {
  window.dispatchEvent(new CustomEvent('adpage:blocklist-changed'))
  try {
    const channel = new BroadcastChannel('adpage-blocklist')
    channel.postMessage('changed')
    channel.close()
  } catch {
    // Ignore browsers without BroadcastChannel.
  }
}

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
    return {
      ok: false,
      error: data.error || 'Policy request failed.',
      code: data.code || 'ERROR',
    }
  }
  return { ok: true, ...data }
}

export async function listPolicies() {
  return request('/api/policies')
}

export async function getPolicy(id) {
  return request(`/api/policies/${encodeURIComponent(id)}`)
}

export async function updatePolicy(id, body) {
  return request(`/api/policies/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function createPolicy(body) {
  return request('/api/policies', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function deletePolicy(id) {
  return request(`/api/policies/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function addPolicyUrl(policyId, url) {
  const result = await request(`/api/policies/${encodeURIComponent(policyId)}/urls`, {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
  if (result.ok) notifyBlocklistChanged()
  return result
}

export async function deletePolicyUrl(policyId, id) {
  const result = await request(
    `/api/policies/${encodeURIComponent(policyId)}/urls/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
  if (result.ok) notifyBlocklistChanged()
  return result
}

export async function addPolicyDomain(policyId, domain) {
  return request(`/api/policies/${encodeURIComponent(policyId)}/domains`, {
    method: 'POST',
    body: JSON.stringify({ domain }),
  })
}

export async function deletePolicyDomain(policyId, id) {
  return request(
    `/api/policies/${encodeURIComponent(policyId)}/domains/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
}

export async function addPolicyKeyword(policyId, keyword, language, category) {
  return request(`/api/policies/${encodeURIComponent(policyId)}/keywords`, {
    method: 'POST',
    body: JSON.stringify({ keyword, language, category }),
  })
}

export async function deletePolicyKeyword(policyId, id) {
  return request(
    `/api/policies/${encodeURIComponent(policyId)}/keywords/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
}

export async function setPolicyCategory(policyId, category, enabled) {
  return request(
    `/api/policies/${encodeURIComponent(policyId)}/categories/${encodeURIComponent(category)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    },
  )
}

export async function previewPolicyMatch(policyId, url, text) {
  return request(`/api/policies/${encodeURIComponent(policyId)}/match`, {
    method: 'POST',
    body: JSON.stringify({ url, text }),
  })
}
