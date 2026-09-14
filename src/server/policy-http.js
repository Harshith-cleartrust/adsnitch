import {
  addDomain,
  addKeyword,
  createPolicy,
  deleteDomain,
  deleteKeyword,
  deletePolicy,
  deny,
  getPolicy,
  listPolicies,
  previewMatch,
  resolveActor,
  setCategoryEnabled,
  updatePolicy,
  assertAdUrl,
} from './policies.js'
import {
  createBlockedUrl,
  deleteBlockedUrl,
} from './tenant.js'

function errorStatus(err) {
  if (err?.code === 'INVALID') return 400
  if (err?.code === 'P2002') return 409
  return 500
}

function errorBody(err) {
  if (err?.code === 'P2002') {
    return { ok: false, error: 'That rule already exists.', code: 'DUPLICATE' }
  }
  return {
    ok: false,
    error: err.message || 'Policy request failed.',
    code: err.code || 'ERROR',
  }
}

export async function handlePolicyRequest(req, res, url, { sendJson, readBody, readSession, bearerToken }) {
  if (!url.pathname.startsWith('/api/policies')) return false

  const actor = await resolveActor(readSession(bearerToken(req)))
  if (!actor) {
    sendJson(res, 401, {
      ok: false,
      error: 'Unauthorized. Admin access required.',
      code: 'UNAUTHORIZED',
    })
    return true
  }

  const parts = url.pathname.split('/').filter(Boolean)
  const policyId = parts[2]
  const section = parts[3]
  const ruleId = parts[4]

  try {
    if (req.method === 'GET' && parts.length === 2) {
      const blocked = deny(actor, actor.organizationId, false)
      if (blocked) return sendJson(res, blocked.status, { ok: false, ...blocked }) || true
      return sendJson(res, 200, { policies: await listPolicies(actor.organizationId) }) || true
    }

    if (req.method === 'POST' && parts.length === 2) {
      const blocked = deny(actor, actor.organizationId, true)
      if (blocked) return sendJson(res, blocked.status, { ok: false, ...blocked }) || true
      const body = await readBody(req)
      const policy = await createPolicy(actor.organizationId, body)
      return sendJson(res, 201, { ok: true, policy }) || true
    }

    if (!policyId) return sendJson(res, 404, { ok: false, error: 'Not found.' }) || true

    const owned = await getPolicy(actor.organizationId, policyId)
    if (!owned && req.method !== 'GET') {
      sendJson(res, 404, { ok: false, error: 'Policy not found.', code: 'NOT_FOUND' })
      return true
    }

    if (req.method === 'GET' && parts.length === 3) {
      if (!owned) {
        sendJson(res, 404, { ok: false, error: 'Policy not found.', code: 'NOT_FOUND' })
        return true
      }
      return sendJson(res, 200, { policy: owned }) || true
    }

    if ((req.method === 'PATCH' || req.method === 'PUT') && parts.length === 3) {
      const blocked = deny(actor, actor.organizationId, true)
      if (blocked) return sendJson(res, blocked.status, { ok: false, ...blocked }) || true
      const body = await readBody(req)
      const policy = await updatePolicy(actor.organizationId, policyId, body)
      if (!policy) {
        sendJson(res, 404, { ok: false, error: 'Policy not found.', code: 'NOT_FOUND' })
        return true
      }
      return sendJson(res, 200, { ok: true, policy }) || true
    }

    if (req.method === 'DELETE' && parts.length === 3) {
      const blocked = deny(actor, actor.organizationId, true)
      if (blocked) return sendJson(res, blocked.status, { ok: false, ...blocked }) || true
      const removed = await deletePolicy(actor.organizationId, policyId)
      if (!removed) {
        sendJson(res, 404, { ok: false, error: 'Policy not found.', code: 'NOT_FOUND' })
        return true
      }
      return sendJson(res, 200, { ok: true }) || true
    }

    if (req.method === 'POST' && section === 'match') {
      const body = await readBody(req)
      const result = await previewMatch(actor.organizationId, policyId, {
        url: body.url,
        text: body.text,
      })
      if (!result) {
        sendJson(res, 404, { ok: false, error: 'Policy not found.', code: 'NOT_FOUND' })
        return true
      }
      return sendJson(res, 200, result) || true
    }

    if (req.method === 'POST' && section === 'urls') {
      const blocked = deny(actor, actor.organizationId, true)
      if (blocked) return sendJson(res, blocked.status, { ok: false, ...blocked }) || true
      const body = await readBody(req)
      const urlValue = assertAdUrl(body.url)
      const created = await createBlockedUrl(actor.organizationId, policyId, urlValue)
      return sendJson(res, 201, { ok: true, url: created }) || true
    }

    if (req.method === 'DELETE' && section === 'urls' && ruleId) {
      const blocked = deny(actor, actor.organizationId, true)
      if (blocked) return sendJson(res, blocked.status, { ok: false, ...blocked }) || true
      const removed = await deleteBlockedUrl(actor.organizationId, policyId, ruleId)
      if (!removed) {
        sendJson(res, 404, { ok: false, error: 'URL not found.', code: 'NOT_FOUND' })
        return true
      }
      return sendJson(res, 200, { ok: true }) || true
    }

    if (req.method === 'POST' && section === 'domains') {
      const blocked = deny(actor, actor.organizationId, true)
      if (blocked) return sendJson(res, blocked.status, { ok: false, ...blocked }) || true
      const body = await readBody(req)
      const created = await addDomain(actor.organizationId, policyId, body.domain)
      if (!created) {
        sendJson(res, 404, { ok: false, error: 'Policy not found.', code: 'NOT_FOUND' })
        return true
      }
      return sendJson(res, 201, { ok: true, domain: created }) || true
    }

    if (req.method === 'DELETE' && section === 'domains' && ruleId) {
      const blocked = deny(actor, actor.organizationId, true)
      if (blocked) return sendJson(res, blocked.status, { ok: false, ...blocked }) || true
      const removed = await deleteDomain(actor.organizationId, policyId, ruleId)
      if (!removed) {
        sendJson(res, 404, { ok: false, error: 'Domain not found.', code: 'NOT_FOUND' })
        return true
      }
      return sendJson(res, 200, { ok: true }) || true
    }

    if (req.method === 'POST' && section === 'keywords') {
      const blocked = deny(actor, actor.organizationId, true)
      if (blocked) return sendJson(res, blocked.status, { ok: false, ...blocked }) || true
      const body = await readBody(req)
      const created = await addKeyword(
        actor.organizationId,
        policyId,
        body.keyword,
        body.language,
        body.category,
      )
      if (!created) {
        sendJson(res, 404, { ok: false, error: 'Policy not found.', code: 'NOT_FOUND' })
        return true
      }
      return sendJson(res, 201, { ok: true, keyword: created }) || true
    }

    if (req.method === 'DELETE' && section === 'keywords' && ruleId) {
      const blocked = deny(actor, actor.organizationId, true)
      if (blocked) return sendJson(res, blocked.status, { ok: false, ...blocked }) || true
      const removed = await deleteKeyword(actor.organizationId, policyId, ruleId)
      if (!removed) {
        sendJson(res, 404, { ok: false, error: 'Keyword not found.', code: 'NOT_FOUND' })
        return true
      }
      return sendJson(res, 200, { ok: true }) || true
    }

    if ((req.method === 'PATCH' || req.method === 'PUT') && section === 'categories' && ruleId) {
      const blocked = deny(actor, actor.organizationId, true)
      if (blocked) return sendJson(res, blocked.status, { ok: false, ...blocked }) || true
      const body = await readBody(req)
      const policy = await setCategoryEnabled(
        actor.organizationId,
        policyId,
        ruleId,
        Boolean(body.enabled),
      )
      if (!policy) {
        sendJson(res, 404, { ok: false, error: 'Policy not found.', code: 'NOT_FOUND' })
        return true
      }
      return sendJson(res, 200, { ok: true, policy }) || true
    }

    sendJson(res, 404, { ok: false, error: 'Not found.' })
    return true
  } catch (err) {
    const status = errorStatus(err)
    if (status === 500) console.error('[policy-api]', err)
    sendJson(res, status, errorBody(err))
    return true
  }
}
