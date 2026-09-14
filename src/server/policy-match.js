const PROTOCOL = /^[a-z][a-z0-9+.-]*:/i

function invalid(message) {
  const error = new Error(message)
  error.code = 'INVALID'
  return error
}

export function normalizeAdUrl(raw) {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) throw invalid('URL is required.')

  let withProtocol = trimmed
  if (!PROTOCOL.test(trimmed)) withProtocol = `https://${trimmed}`

  const parsed = new URL(withProtocol)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw invalid('Only http and https URLs are allowed.')
  }

  const host = String(parsed.hostname || '').toLowerCase().replace(/\.+$/, '')
  if (!host || (!host.includes('.') && host !== 'localhost' && !host.endsWith('.localhost'))) {
    throw invalid('Enter a valid URL with a hostname.')
  }

  parsed.hostname = host
  parsed.hash = ''
  let pathname = parsed.pathname
  if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1)
  parsed.pathname = pathname || '/'
  return parsed.toString()
}

export function normalizeDomain(raw) {
  let value = String(raw ?? '').trim().toLowerCase()
  if (!value) throw invalid('Domain is required.')
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  value = value.split('/')[0].split('?')[0].split('#')[0]
  value = value.replace(/:\d+$/, '').replace(/\.+$/, '')
  if (value.startsWith('www.')) value = value.slice(4)
  if (!isDomain(value)) {
    throw invalid('Enter a valid domain, such as badcasino.com.')
  }
  return value
}

function isDomain(domain) {
  if (!domain || domain.length > 253 || domain.includes('..')) return false
  const labels = domain.split('.')
  if (labels.length < 2) return false
  return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
}

export function hostnameMatchesDomain(hostname, domain) {
  const host = String(hostname || '').toLowerCase().replace(/\.+$/, '')
  const rule = String(domain || '').toLowerCase().replace(/\.+$/, '')
  if (!host || !rule) return false
  return host === rule || host.endsWith(`.${rule}`)
}

function keywordPattern(keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu')
}

export function keywordMatches(keyword, haystack) {
  const needle = String(keyword || '').trim().normalize('NFC')
  const text = String(haystack || '').normalize('NFC')
  if (!needle || !text) return false
  if (keywordPattern(needle).test(text)) return true
  if (/\s/.test(needle)) {
    return keywordPattern(needle).test(text.replace(/[-_/]+/g, ' '))
  }
  return false
}

function enabled(rule) {
  return rule && rule.enabled !== false
}

/**
 * Match an advertisement, never the visitor page URL.
 * input.url is the ad URL. input.text is optional ad copy.
 */
export function matchAd(input, policy) {
  if (!policy?.enabled) return { matched: false }

  let url = ''
  let host = ''
  try {
    url = normalizeAdUrl(input?.url)
    host = new URL(url).hostname
  } catch {
    return { matched: false }
  }

  const urls = Array.isArray(policy.urls) ? policy.urls : []
  const exact = urls.find((rule) => enabled(rule) && rule.url === url)
  if (exact) return { matched: true, ruleType: 'URL', ruleId: exact.id }

  const domains = Array.isArray(policy.domains) ? policy.domains : []
  const domain = domains.find(
    (rule) => enabled(rule) && hostnameMatchesDomain(host, rule.domain),
  )
  if (domain) {
    return { matched: true, ruleType: 'DOMAIN', ruleId: domain.id, domain: domain.domain }
  }

  const haystack = [url, input?.text].filter(Boolean).join('\n')
  const keywords = (Array.isArray(policy.keywords) ? policy.keywords : []).filter(
    (rule) => enabled(rule) && !rule.category,
  )
  const keyword = keywords.find((rule) => keywordMatches(rule.keyword, haystack))
  if (keyword) {
    return { matched: true, ruleType: 'KEYWORD', ruleId: keyword.id, keyword: keyword.keyword }
  }

  const categories = new Set(
    (Array.isArray(policy.categories) ? policy.categories : [])
      .filter((rule) => enabled(rule))
      .map((rule) => rule.category),
  )
  const packKeyword = (Array.isArray(policy.keywords) ? policy.keywords : []).find(
    (rule) =>
      enabled(rule) &&
      rule.category &&
      categories.has(rule.category) &&
      keywordMatches(rule.keyword, haystack),
  )
  if (packKeyword) {
    return {
      matched: true,
      ruleType: 'CATEGORY',
      ruleId: packKeyword.id,
      keyword: packKeyword.keyword,
      category: packKeyword.category,
    }
  }

  return { matched: false }
}

/** Evaluate advertisement URLs only. Never the visitor page. */
export function evaluateAds(ads, policy) {
  const list = Array.isArray(ads) ? ads.slice(0, 80) : []
  return list.map((ad, index) => {
    const text = String(ad?.text || '').slice(0, 500)
    const result = matchAd({ url: ad?.url, text }, policy)
    return {
      id: ad?.id != null ? String(ad.id) : String(index),
      input: String(ad?.url || ''),
      ...result,
    }
  })
}
