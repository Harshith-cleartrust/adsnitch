import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { handlePolicyRequest } from './src/server/policy-http.js'
import { handleSiteRequest } from './src/server/site-http.js'
import { checkAds } from './src/server/policies.js'
import { normalizeAdUrl } from './src/server/policy-match.js'
import {
  createBlockedUrl,
  deleteBlockedUrl,
  ensureDefaultTenant,
  findBlockedUrlByNormalized,
  isPolicyEnabled,
  listBlockedUrls,
  listUrlCatchEvents,
  recordPolicyCatch,
  recordUrlCatch,
} from './src/server/tenant.js'

const DAY_MS = 24 * 60 * 60 * 1000

function withCatchStats(entry, events) {
  const mine = events.filter((event) => event.matchedRuleId === entry.id)
  const latest = mine[mine.length - 1]
  const pageLoad = latest
    ? mine.filter((event) => event.pageLoadId === latest.pageLoadId).length
    : 0
  return {
    id: entry.id,
    url: entry.url,
    created_at: entry.createdAt.toISOString(),
    updated_at: entry.updatedAt.toISOString(),
    caught_count: mine.length,
    caught_24h: mine.length,
    caught_page_load: pageLoad,
  }
}

let storeQueue = Promise.resolve()

function enqueueStore(fn) {
  const run = storeQueue.then(fn, fn)
  storeQueue = run.then(
    () => {},
    () => {},
  )
  return run
}

const DEMO_ADMIN = {
  username: 'admin',
  password: 'admin123',
}

const SESSION_SECRET = 'adsnitch-demo-session'
const SESSION_MS = 30 * 24 * 60 * 60 * 1000

function signSession(username) {
  const payload = Buffer.from(
    JSON.stringify({ username, exp: Date.now() + SESSION_MS }),
  ).toString('base64url')
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

function readSession(token) {
  const [payload, sig] = String(token || '').split('.')
  if (!payload || !sig) return null
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url')
  const left = Buffer.from(sig)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!data?.username || !data.exp || Date.now() > data.exp) return null
    return data
  } catch {
    return null
  }
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.end(JSON.stringify(body))
}

function bearerToken(req) {
  const header = req.headers.authorization || ''
  const match = String(header).match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ''
}

function adminSession(req) {
  return readSession(bearerToken(req))
}

function isAdminRequest(req) {
  return Boolean(adminSession(req))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

/**
 * Shared blocklist API so any landing page can fetch blocked ad URLs.
 * Exact URL rules live in PostgreSQL, scoped to the default organization.
 * data/blocklist.json is no longer written. Import it with npm run db:import.
 */
function serveCustomerScript(res) {
  const file = path.resolve(process.cwd(), 'public/a.min.js')
  if (!fs.existsSync(file)) {
    res.statusCode = 404
    res.end('')
    return
  }
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.setHeader('X-AdSnitch-Version', '0.3.1')
  res.end(fs.readFileSync(file))
}

export function blocklistApiPlugin() {
  const middleware = async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost')
        if (url.pathname === '/a.js') return serveCustomerScript(res)

        const isAuth =
          url.pathname.startsWith('/api/login') ||
          url.pathname === '/api/logout' ||
          url.pathname === '/api/session'
        const isBlocklist = url.pathname.startsWith('/api/blocklist')
        const isPolicy = url.pathname.startsWith('/api/policies')
        const isSite =
          url.pathname.startsWith('/api/sites') || url.pathname.startsWith('/api/site/')
        if (!isAuth && !isBlocklist && !isPolicy && !isSite) return next()

        if (req.method === 'OPTIONS') {
          return sendJson(res, 204, {})
        }

        try {
          if (req.method === 'POST' && url.pathname === '/api/login') {
            const body = await readBody(req)
            const username = String(body.username || '').trim()
            const password = String(body.password || '')
            if (
              username !== DEMO_ADMIN.username ||
              password !== DEMO_ADMIN.password
            ) {
              return sendJson(res, 401, {
                ok: false,
                error: 'Invalid username or password.',
                code: 'INVALID_CREDENTIALS',
              })
            }
            return sendJson(res, 200, {
              ok: true,
              token: signSession(username),
              username,
            })
          }

          if (req.method === 'GET' && url.pathname === '/api/session') {
            const session = adminSession(req)
            if (!session) {
              return sendJson(res, 401, {
                ok: false,
                error: 'Session expired. Sign in again.',
                code: 'UNAUTHORIZED',
              })
            }
            return sendJson(res, 200, { ok: true, username: session.username })
          }

          if (req.method === 'POST' && url.pathname === '/api/logout') {
            return sendJson(res, 200, { ok: true })
          }

          if (isSite) {
            const handled = await handleSiteRequest(req, res, url, {
              sendJson,
              readBody,
              readSession,
              bearerToken,
            })
            if (handled) return
          }

          if (isPolicy) {
            const handled = await handlePolicyRequest(req, res, url, {
              sendJson,
              readBody,
              readSession,
              bearerToken,
            })
            if (handled) return
          }

          // POST /api/blocklist/check — public. Match ad URLs against the default policy.
          // Keywords stay in PostgreSQL. Failures should be treated as allow by the caller.
          if (req.method === 'POST' && url.pathname === '/api/blocklist/check') {
            const body = await readBody(req)
            const tenant = await ensureDefaultTenant()
            const results = await checkAds(
              tenant.organizationId,
              tenant.policyId,
              body.ads,
            )
            return sendJson(res, 200, { results })
          }

          // GET /api/blocklist — public exact URLs, still used by the admin list.
          if (req.method === 'GET' && url.pathname === '/api/blocklist') {
            const tenant = await ensureDefaultTenant()
            const live = await isPolicyEnabled(tenant.organizationId, tenant.policyId)
            if (!live) return sendJson(res, 200, { entries: [], urls: [] })
            const since = new Date(Date.now() - DAY_MS)
            const [rows, events] = await Promise.all([
              listBlockedUrls(tenant.organizationId, tenant.policyId),
              listUrlCatchEvents(tenant.organizationId, tenant.policyId, since),
            ])
            const enabled = rows.filter((row) => row.enabled)
            const entries = enabled.map((row) => withCatchStats(row, events))
            return sendJson(res, 200, {
              entries,
              urls: entries.map((entry) => entry.url),
            })
          }

          // POST /api/blocklist/caught — public. Increment how many times a URL was caught.
          if (req.method === 'POST' && url.pathname === '/api/blocklist/caught') {
            const body = await readBody(req)
            const rawUrls = Array.isArray(body.urls)
              ? body.urls
              : body.url
                ? [body.url]
                : []
            const pageLoadId =
              String(body.page_load_id || '')
                .trim()
                .slice(0, 80) || crypto.randomUUID()
            const ads = Array.isArray(body.ads)
              ? body.ads
              : rawUrls.map((url) => ({ url }))
            return enqueueStore(async () => {
              const tenant = await ensureDefaultTenant()
              const results = await checkAds(
                tenant.organizationId,
                tenant.policyId,
                ads,
              )
              for (const match of results) {
                if (!match.matched) continue
                let normalized = match.input
                try {
                  normalized = normalizeAdUrl(match.input)
                } catch {
                  continue
                }
                if (match.ruleType === 'URL') {
                  await recordUrlCatch({
                    organizationId: tenant.organizationId,
                    siteId: tenant.siteId,
                    policyId: tenant.policyId,
                    blockedUrlId: match.ruleId,
                    url: normalized,
                    pageLoadId,
                  })
                  continue
                }
                await recordPolicyCatch({
                  organizationId: tenant.organizationId,
                  siteId: tenant.siteId,
                  policyId: tenant.policyId,
                  match,
                  url: normalized,
                  pageLoadId,
                })
              }
              return sendJson(res, 200, { ok: true })
            })
          }

          // POST /api/blocklist — admin only
          if (req.method === 'POST' && url.pathname === '/api/blocklist') {
            if (!isAdminRequest(req)) {
              return sendJson(res, 403, {
                ok: false,
                error: 'Unauthorized. Admin access required.',
                code: 'UNAUTHORIZED',
              })
            }

            const body = await readBody(req)
            let normalized
            try {
              normalized = normalizeAdUrl(body.url)
            } catch (err) {
              return sendJson(res, 400, {
                ok: false,
                error: err.message || 'Invalid URL.',
                code: 'INVALID',
              })
            }

            const tenant = await ensureDefaultTenant()
            const existing = await findBlockedUrlByNormalized(
              tenant.organizationId,
              tenant.policyId,
              normalized,
            )
            if (existing) {
              return sendJson(res, 409, {
                ok: false,
                error: 'This URL is already on the blocklist.',
                code: 'DUPLICATE',
                entry: {
                  id: existing.id,
                  url: existing.url,
                  created_at: existing.createdAt,
                  updated_at: existing.updatedAt,
                },
              })
            }

            const created = await createBlockedUrl(
              tenant.organizationId,
              tenant.policyId,
              normalized,
            )
            return sendJson(res, 201, {
              ok: true,
              entry: {
                id: created.id,
                url: created.url,
                created_at: created.createdAt,
                updated_at: created.updatedAt,
                caught_count: 0,
                caught_24h: 0,
              },
            })
          }

          // DELETE /api/blocklist/:id — admin only
          const deleteMatch = url.pathname.match(
            /^\/api\/blocklist\/([^/]+)$/,
          )
          if (req.method === 'DELETE' && deleteMatch) {
            if (!isAdminRequest(req)) {
              return sendJson(res, 403, {
                ok: false,
                error: 'Unauthorized. Admin access required.',
                code: 'UNAUTHORIZED',
              })
            }

            const tenant = await ensureDefaultTenant()
            const id = decodeURIComponent(deleteMatch[1])
            const removed = await deleteBlockedUrl(
              tenant.organizationId,
              tenant.policyId,
              id,
            )
            if (!removed) {
              return sendJson(res, 404, {
                ok: false,
                error: 'URL not found.',
                code: 'NOT_FOUND',
              })
            }
            return sendJson(res, 200, { ok: true })
          }

          return sendJson(res, 404, { ok: false, error: 'Not found.' })
        } catch (err) {
          if (err?.code === 'INVALID') {
            return sendJson(res, 400, { ok: false, error: err.message, code: 'INVALID' })
          }
          if (err?.code === 'P2002') {
            return sendJson(res, 409, { ok: false, error: 'That site already exists.', code: 'DUPLICATE' })
          }
          console.error('[blocklist-api]', err)
          return sendJson(res, 500, {
            ok: false,
            error: 'Blocklist server error.',
          })
        }
  }

  return {
    name: 'adpage-blocklist-api',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
