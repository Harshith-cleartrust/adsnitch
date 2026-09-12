import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, 'data')
const DATA_FILE = path.join(DATA_DIR, 'blocklist.json')

function isAllowedHostname(hostname) {
  const host = String(hostname || '').toLowerCase()
  if (!host) return false
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  return host.includes('.')
}

function normalizeAdUrl(raw) {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) throw new Error('URL is required.')

  let withProtocol = trimmed
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    withProtocol = `https://${trimmed}`
  }

  const parsed = new URL(withProtocol)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http and https URLs are allowed.')
  }
  if (!isAllowedHostname(parsed.hostname)) {
    throw new Error('Enter a valid URL with a hostname.')
  }

  parsed.hostname = parsed.hostname.toLowerCase()
  parsed.hash = ''
  let pathname = parsed.pathname
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1)
  }
  parsed.pathname = pathname || '/'
  return parsed.toString()
}

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]', 'utf8')
  }
}

function readEntries() {
  ensureStore()
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeEntries(entries) {
  ensureStore()
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), 'utf8')
}

const DAY_MS = 24 * 60 * 60 * 1000

function catchEvents(entry, now = Date.now()) {
  const cutoff = now - DAY_MS
  const stored = Array.isArray(entry.caught_events) ? entry.caught_events : []
  const recent = stored.filter((event) => {
    const at = new Date(event?.at).getTime()
    return Number.isFinite(at) && at >= cutoff
  })
  if (recent.length) return recent
  const legacy = Number(entry.caught_count) || 0
  if (!legacy) return []
  const at = entry.updated_at || entry.created_at || new Date(now).toISOString()
  if (new Date(at).getTime() < cutoff) return []
  return Array.from({ length: legacy }, () => ({
    at,
    page_load_id: 'legacy',
  }))
}

function withCatchStats(entry, now = Date.now()) {
  const events = catchEvents(entry, now)
  const latest = events[events.length - 1]
  const pageLoad = latest
    ? events.filter((event) => event.page_load_id === latest.page_load_id).length
    : 0
  const { caught_events, ...rest } = entry
  return {
    ...rest,
    caught_24h: events.length,
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
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
 * Persists to data/blocklist.json
 */
export function blocklistApiPlugin() {
  return {
    name: 'adpage-blocklist-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost')
        const isAuth =
          url.pathname.startsWith('/api/login') ||
          url.pathname === '/api/logout' ||
          url.pathname === '/api/session'
        const isBlocklist = url.pathname.startsWith('/api/blocklist')
        if (!isAuth && !isBlocklist) return next()

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

          // GET /api/blocklist — public (for embed script on any page)
          if (req.method === 'GET' && url.pathname === '/api/blocklist') {
            const entries = readEntries().sort(
              (a, b) => new Date(b.created_at) - new Date(a.created_at),
            )
            const now = Date.now()
            return sendJson(res, 200, {
              entries: entries.map((entry) => withCatchStats(entry, now)),
              urls: entries.map((e) => e.url),
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
            return enqueueStore(() => {
              const entries = readEntries()
              const byUrl = new Map(entries.map((entry) => [entry.url, entry]))
              const nowIso = new Date().toISOString()
              const cutoff = Date.now() - DAY_MS
              let changed = false
              for (const raw of rawUrls) {
                let normalized
                try {
                  normalized = normalizeAdUrl(raw)
                } catch {
                  continue
                }
                const entry = byUrl.get(normalized)
                if (!entry) continue
                const events = catchEvents(entry).filter(
                  (event) => new Date(event.at).getTime() >= cutoff,
                )
                events.push({ at: nowIso, page_load_id: pageLoadId })
                entry.caught_events = events
                entry.caught_count = (Number(entry.caught_count) || 0) + 1
                entry.updated_at = nowIso
                changed = true
              }
              if (changed) writeEntries(entries)
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

            const entries = readEntries()
            const existing = entries.find((e) => e.url === normalized)
            if (existing) {
              return sendJson(res, 409, {
                ok: false,
                error: 'This URL is already on the blocklist.',
                code: 'DUPLICATE',
                entry: existing,
              })
            }

            const now = new Date().toISOString()
            const entry = {
              id: crypto.randomUUID(),
              url: normalized,
              created_at: now,
              updated_at: now,
              caught_count: 0,
            }
            entries.push(entry)
            writeEntries(entries)
            return sendJson(res, 201, { ok: true, entry })
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

            const id = decodeURIComponent(deleteMatch[1])
            const entries = readEntries()
            const next = entries.filter((e) => e.id !== id)
            if (next.length === entries.length) {
              return sendJson(res, 404, {
                ok: false,
                error: 'URL not found.',
                code: 'NOT_FOUND',
              })
            }
            writeEntries(next)
            return sendJson(res, 200, { ok: true })
          }

          return sendJson(res, 404, { ok: false, error: 'Not found.' })
        } catch (err) {
          console.error('[blocklist-api]', err)
          return sendJson(res, 500, {
            ok: false,
            error: 'Blocklist server error.',
          })
        }
      })
    },
  }
}
