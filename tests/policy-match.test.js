import assert from 'node:assert/strict'
import test from 'node:test'
import {
  evaluateAds,
  keywordMatches,
  matchAd,
  normalizeDomain,
} from '../src/server/policy-match.js'

const policy = {
  enabled: true,
  urls: [{ id: 'url-1', url: 'https://example.com/bad-ad', enabled: true }],
  domains: [{ id: 'domain-1', domain: 'badcasino.com', enabled: true }],
  keywords: [
    { id: 'kw-1', keyword: 'casino', language: 'en', category: null, enabled: true },
    { id: 'kw-bet', keyword: 'bet', language: 'en', category: null, enabled: false },
    {
      id: 'pack-1',
      keyword: 'glücksspiel',
      language: 'de',
      category: 'GAMBLING',
      enabled: true,
    },
  ],
  categories: [{ id: 'cat-1', category: 'GAMBLING', enabled: true }],
}

test('exact URL matches only the normalized ad URL', () => {
  assert.deepEqual(matchAd({ url: 'https://example.com/bad-ad' }, policy), {
    matched: true,
    ruleType: 'URL',
    ruleId: 'url-1',
  })
  assert.deepEqual(matchAd({ url: 'https://example.com/other-ad' }, policy), {
    matched: false,
  })
})

test('domain matching uses hostname boundaries, including www and subdomains', () => {
  assert.equal(normalizeDomain('https://www.BadCasino.com/path'), 'badcasino.com')
  assert.equal(normalizeDomain('offers.badcasino.com.'), 'offers.badcasino.com')
  assert.equal(normalizeDomain('BADCASINO.COM.'), 'badcasino.com')

  const hit = (url) => matchAd({ url, text: '' }, { ...policy, keywords: [], categories: [] })
  assert.equal(hit('https://badcasino.com/ad').ruleType, 'DOMAIN')
  assert.equal(hit('https://www.badcasino.com/banner').domain, 'badcasino.com')
  assert.equal(hit('https://offers.badcasino.com/ad123').ruleType, 'DOMAIN')
  assert.deepEqual(hit('https://notbadcasino.com/ad'), { matched: false })
})

test('keywords are case-insensitive, Unicode-aware, and do not match inside words', () => {
  const keywordOnly = {
    enabled: true,
    urls: [],
    domains: [],
    keywords: [{ id: 'kw-1', keyword: 'casino', category: null, enabled: true }],
    categories: [],
  }
  assert.equal(matchAd({ url: 'https://example.com/ad', text: 'CASINO offer' }, keywordOnly).keyword, 'casino')
  assert.equal(matchAd({ url: 'https://example.com/casino-offer' }, keywordOnly).ruleType, 'KEYWORD')
  assert.equal(keywordMatches('bet', 'better odds'), false)
  assert.equal(keywordMatches('bet', 'alphabet'), false)
  assert.equal(keywordMatches('bet', 'free bet now'), true)
  assert.equal(keywordMatches('glücksspiel', 'Online Glücksspiel'), true)
  assert.equal(keywordMatches('sports betting', 'https://example.com/sports-betting'), true)
})

test('category pack is evaluated after exact, domain, and custom keywords', () => {
  const result = matchAd(
    { url: 'https://example.com/ad', text: 'Glücksspiel' },
    {
      ...policy,
      urls: [],
      domains: [],
      keywords: policy.keywords.filter((row) => row.category),
    },
  )
  assert.equal(result.matched, true)
  assert.equal(result.ruleType, 'CATEGORY')
  assert.equal(result.ruleId, 'pack-1')
  assert.equal(result.keyword, 'glücksspiel')
  assert.equal(result.category, 'GAMBLING')
})

test('disabled policy, rule, and category do not block', () => {
  assert.deepEqual(matchAd({ url: 'https://example.com/bad-ad' }, { ...policy, enabled: false }), {
    matched: false,
  })
  assert.deepEqual(
    matchAd(
      { url: 'https://example.com/other' },
      {
        enabled: true,
        urls: [{ id: 'url-1', url: 'https://example.com/other', enabled: false }],
        domains: [],
        keywords: [],
        categories: [],
      },
    ),
    { matched: false },
  )
  assert.deepEqual(
    matchAd(
      { url: 'https://example.com/ad', text: 'Glücksspiel' },
      { ...policy, urls: [], domains: [], keywords: policy.keywords.filter((row) => row.category), categories: [{ category: 'GAMBLING', enabled: false }] },
    ),
    { matched: false },
  )
})

test('batch check reports URL, domain, keyword, and category without sending rules to the page', () => {
  const results = evaluateAds(
    [
      { id: 'exact', url: 'https://example.com/bad-ad' },
      { id: 'domain', url: 'https://offers.badcasino.com/ad123' },
      { id: 'keyword', url: 'https://example.com/clean', text: 'CASINO night' },
      { id: 'pack', url: 'https://example.com/clean', text: 'Glücksspiel' },
      { id: 'miss', url: 'https://notbadcasino.com/ad', text: 'better' },
    ],
    policy,
  )
  assert.equal(results.find((row) => row.id === 'exact').ruleType, 'URL')
  assert.equal(results.find((row) => row.id === 'domain').ruleType, 'DOMAIN')
  assert.equal(results.find((row) => row.id === 'keyword').ruleType, 'KEYWORD')
  assert.equal(results.find((row) => row.id === 'pack').ruleType, 'CATEGORY')
  assert.equal(results.find((row) => row.id === 'miss').matched, false)
})

test('invalid ad URL fails open', () => {
  assert.deepEqual(matchAd({ url: 'not a url' }, policy), { matched: false })
})

test('rejects lookalike and invalid domains', () => {
  assert.throws(() => normalizeDomain('not a domain'))
  assert.throws(() => normalizeDomain('localhost'))
  assert.equal(normalizeDomain('https://www.badcasino.com:443/ad?x=1'), 'badcasino.com')
})
