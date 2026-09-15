export const SCRIPT_VERSION = '0.3.1'

function isLocalHost(hostname) {
  const host = String(hostname || '').toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost')
}

/**
 * Origin that serves /a.js. Production must be HTTPS and must not be localhost.
 * Returns null when a snippet must not be shown.
 */
export function scriptOrigin({ configured, nodeEnv, requestHost } = {}) {
  const raw = String(configured || '').trim().replace(/\/$/, '')
  if (raw) {
    let url
    try {
      url = new URL(raw)
    } catch {
      return null
    }
    if (nodeEnv === 'production') {
      if (url.protocol !== 'https:') return null
      if (isLocalHost(url.hostname)) return null
    }
    if (!['http:', 'https:'].includes(url.protocol)) return null
    return url.origin
  }
  if (nodeEnv === 'production') return null
  const host = String(requestHost || '').split(',')[0].trim()
  if (!host || !isLocalHost(host.split(':')[0])) return null
  return `http://${host}`
}

export function installSnippet(origin, siteKey) {
  if (!origin || !siteKey) return ''
  return `<script\n  src="${origin}/a.js?k=${siteKey}"\n  async\n  defer>\n</script>`
}
