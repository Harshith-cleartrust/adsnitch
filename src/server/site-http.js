import {
  assignSitePolicy,
  checkAdsForSiteKey,
  createSite,
  installOrigin,
  listSites,
  regenerateSiteKey,
  scriptForPolicy,
  reportCatchesForSiteKey,
  revokeSiteKey,
} from './sites.js'
import { deny, resolveActor } from './policies.js'

const hits = new Map()
const WINDOW_MS = 60_000
const MAX_HITS = 120

function allow(key) {
  const now = Date.now()
  const recent = (hits.get(key) || []).filter((time) => now - time < WINDOW_MS)
  if (recent.length >= MAX_HITS) {
    hits.set(key, recent)
    return false
  }
  recent.push(now)
  hits.set(key, recent)
  return true
}

function siteKeyFrom(url, body) {
  return String(url.searchParams.get('k') || body?.k || '').trim()
}

export async function handleSiteRequest(req, res, url, { sendJson, readBody, readSession, bearerToken }) {
  const origin = installOrigin(req.headers.host)

  if (req.method === 'GET' && url.pathname === '/api/sites') {
    const actor = await resolveActor(readSession(bearerToken(req)))
    if (!actor) {
      sendJson(res, 401, { ok: false, error: 'Unauthorized. Admin access required.', code: 'UNAUTHORIZED' })
      return true
    }
    const blocked = deny(actor, actor.organizationId, false)
    if (blocked) {
      sendJson(res, blocked.status, { ok: false, ...blocked })
      return true
    }
    sendJson(res, 200, {
      origin,
      sites: await listSites(actor.organizationId, origin),
    })
    return true
  }

  if (req.method === 'GET' && url.pathname === '/api/sites/script') {
    const actor = await resolveActor(readSession(bearerToken(req)))
    if (!actor) {
      sendJson(res, 401, { ok: false, error: 'Unauthorized. Admin access required.', code: 'UNAUTHORIZED' })
      return true
    }
    const blocked = deny(actor, actor.organizationId, false)
    if (blocked) {
      sendJson(res, blocked.status, { ok: false, ...blocked })
      return true
    }
    const script = await scriptForPolicy(
      actor.organizationId,
      url.searchParams.get('policy_id'),
      origin,
    )
    if (!script) {
      sendJson(res, 404, { ok: false, error: 'Policy not found.', code: 'NOT_FOUND' })
      return true
    }
    sendJson(res, 200, { ok: true, ...script })
    return true
  }

  if (req.method === 'POST' && url.pathname === '/api/sites') {
    const actor = await resolveActor(readSession(bearerToken(req)))
    if (!actor) {
      sendJson(res, 401, { ok: false, error: 'Unauthorized. Admin access required.', code: 'UNAUTHORIZED' })
      return true
    }
    const blocked = deny(actor, actor.organizationId, true)
    if (blocked) {
      sendJson(res, blocked.status, { ok: false, ...blocked })
      return true
    }
    const body = await readBody(req)
    const site = await createSite(actor.organizationId, body, origin)
    sendJson(res, 201, { ok: true, site, origin })
    return true
  }

  const keyAction = url.pathname.match(/^\/api\/sites\/([^/]+)\/(regenerate|revoke|policy)$/)
  if (keyAction) {
    const actor = await resolveActor(readSession(bearerToken(req)))
    if (!actor) {
      sendJson(res, 401, { ok: false, error: 'Unauthorized. Admin access required.', code: 'UNAUTHORIZED' })
      return true
    }
    const blocked = deny(actor, actor.organizationId, true)
    if (blocked) {
      sendJson(res, blocked.status, { ok: false, ...blocked })
      return true
    }
    const domain = decodeURIComponent(keyAction[1])
    const action = keyAction[2]
    if (req.method === 'POST' && action === 'regenerate') {
      const site = await regenerateSiteKey(actor.organizationId, domain, origin)
      if (!site) {
        sendJson(res, 404, { ok: false, error: 'Site not found.', code: 'NOT_FOUND' })
        return true
      }
      sendJson(res, 200, { ok: true, site })
      return true
    }
    if (req.method === 'POST' && action === 'revoke') {
      const site = await revokeSiteKey(actor.organizationId, domain, origin)
      if (!site) {
        sendJson(res, 404, { ok: false, error: 'Site not found.', code: 'NOT_FOUND' })
        return true
      }
      sendJson(res, 200, { ok: true, site })
      return true
    }
    if ((req.method === 'PATCH' || req.method === 'PUT') && action === 'policy') {
      const body = await readBody(req)
      const site = await assignSitePolicy(
        actor.organizationId,
        domain,
        body.policy_id || null,
        origin,
      )
      if (!site) {
        sendJson(res, 404, { ok: false, error: 'Site not found.', code: 'NOT_FOUND' })
        return true
      }
      sendJson(res, 200, { ok: true, site })
      return true
    }
  }

  if (url.pathname === '/api/site/check' || url.pathname === '/api/site/caught') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'Method not allowed.' })
      return true
    }
    const body = await readBody(req)
    const siteKey = siteKeyFrom(url, body)
    if (!allow(siteKey || req.socket?.remoteAddress || 'anon')) {
      sendJson(res, 200, url.pathname.endsWith('/check') ? { results: [] } : { ok: true })
      return true
    }
    if (url.pathname.endsWith('/check')) {
      const results = await checkAdsForSiteKey(siteKey, body.ads)
      sendJson(res, 200, { results })
      return true
    }
    try {
      await reportCatchesForSiteKey(siteKey, body.ads, body.page_load_id)
    } catch (err) {
      console.error('[site-caught] fail open', err)
    }
    sendJson(res, 200, { ok: true })
    return true
  }

  return false
}
