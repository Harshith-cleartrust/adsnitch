import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { prisma } from '../src/server/db.js'
import { keywordsForPack } from '../src/server/policy-packs.js'
import {
  checkAdsForSiteKey,
  createSite,
  reportCatchesForSiteKey,
  resolveSiteByKey,
  revokeSiteKey,
} from '../src/server/sites.js'
import { installSnippet, scriptOrigin } from '../src/server/script-origin.js'

async function seed() {
  const stamp = `site-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const orgA = await prisma.organization.create({ data: { name: `${stamp}-a` } })
  const orgB = await prisma.organization.create({ data: { name: `${stamp}-b` } })
  const policyA = await prisma.policy.create({
    data: {
      organizationId: orgA.id,
      name: 'Policy A',
      enabled: true,
      blockedUrls: {
        create: [{ url: 'https://example.com/bad-ad', enabled: true }],
      },
      blockedDomains: {
        create: [{ domain: 'badcasino.com', enabled: true }],
      },
      blockedKeywords: {
        create: [
          { keyword: 'sportsbook', language: 'en', category: null, enabled: true },
          { keyword: 'oldword', language: 'en', category: null, enabled: false },
          ...keywordsForPack('GAMBLING')
            .filter((row) => row.keyword === 'casino' || row.keyword === 'glücksspiel')
            .map((row) => ({ ...row, enabled: true })),
        ],
      },
      categories: {
        create: [{ category: 'GAMBLING', enabled: true }],
      },
    },
  })
  const policyB = await prisma.policy.create({
    data: {
      organizationId: orgB.id,
      name: 'Policy B',
      enabled: true,
      blockedDomains: { create: [{ domain: 'other-ads.example', enabled: true }] },
    },
  })
  const siteA = await createSite(orgA.id, { name: 'Site A', domain: 'site-a.example', policy_id: policyA.id }, 'https://script.example')
  const siteB = await createSite(orgB.id, { name: 'Site B', domain: 'site-b.example', policy_id: policyB.id }, 'https://script.example')
  return { orgA, orgB, policyA, policyB, siteA, siteB }
}

function hit(results, id) {
  return results.find((row) => row.id === id)
}

test('script origin never uses localhost in production', () => {
  assert.equal(
    scriptOrigin({ configured: 'http://localhost:5173', nodeEnv: 'production' }),
    null,
  )
  assert.equal(scriptOrigin({ configured: '', nodeEnv: 'production', requestHost: 'localhost:5173' }), null)
  assert.equal(
    scriptOrigin({ configured: 'https://script.example', nodeEnv: 'production' }),
    'https://script.example',
  )
  const snippet = installSnippet('https://script.example', 'ask_test')
  assert.match(snippet, /https:\/\/script\.example\/a\.js\?k=ask_test/)
  assert.equal(snippet.includes('localhost'), false)
})

test('site key uses the assigned policy and fails open otherwise', async () => {
  const data = await seed()
  try {
    const resolved = await resolveSiteByKey(data.siteA.site_key)
    assert.equal(resolved.organizationId, data.orgA.id)
    assert.equal(resolved.policyId, data.policyA.id)
    assert.equal(await resolveSiteByKey('ask_not-a-real-key'), null)

    const results = await checkAdsForSiteKey(data.siteA.site_key, [
      { id: 'exact', url: 'https://example.com/bad-ad' },
      { id: 'domain', url: 'https://badcasino.com/ad' },
      { id: 'sub', url: 'https://offers.badcasino.com/ad' },
      { id: 'www', url: 'https://www.badcasino.com/ad' },
      { id: 'similar', url: 'https://notbadcasino.com/ad' },
      { id: 'keyword', url: 'https://clean.example/ad', text: 'Best sportsbook odds' },
      { id: 'en', url: 'https://clean.example/ad', text: 'Play at the Casino' },
      { id: 'de', url: 'https://clean.example/ad', text: 'Glücksspiel online' },
      { id: 'miss', url: 'https://clean.example/ad', text: 'Fresh coffee' },
      { id: 'page', url: 'https://ads.example.com/sports.html', text: 'Trainers', page_url: 'https://example.com/casino-news' },
      { id: 'disabled-rule', url: 'https://clean.example/oldword' },
    ])

    assert.equal(hit(results, 'exact').ruleType, 'URL')
    assert.equal(hit(results, 'domain').ruleType, 'DOMAIN')
    assert.equal(hit(results, 'sub').ruleType, 'DOMAIN')
    assert.equal(hit(results, 'www').domain, 'badcasino.com')
    assert.equal(hit(results, 'similar').matched, false)
    assert.equal(hit(results, 'keyword').ruleType, 'KEYWORD')
    assert.equal(hit(results, 'en').ruleType, 'CATEGORY')
    assert.equal(hit(results, 'de').keyword, 'glücksspiel')
    assert.equal(hit(results, 'miss').matched, false)
    assert.equal(hit(results, 'page').matched, false)
    assert.equal(hit(results, 'disabled-rule').matched, false)

    const foreign = await checkAdsForSiteKey(data.siteA.site_key, [
      { id: 'b', url: 'https://other-ads.example/banner' },
    ])
    assert.equal(hit(foreign, 'b').matched, false)

    const invalid = await checkAdsForSiteKey('ask_missing', [
      { id: 'x', url: 'https://example.com/bad-ad' },
    ])
    assert.equal(hit(invalid, 'x').matched, false)

    await prisma.policy.update({ where: { id: data.policyA.id }, data: { enabled: false } })
    const disabledPolicy = await checkAdsForSiteKey(data.siteA.site_key, [
      { id: 'exact', url: 'https://example.com/bad-ad' },
    ])
    assert.equal(hit(disabledPolicy, 'exact').matched, false)
    await prisma.policy.update({ where: { id: data.policyA.id }, data: { enabled: true } })

    await prisma.policyCategory.update({
      where: { policyId_category: { policyId: data.policyA.id, category: 'GAMBLING' } },
      data: { enabled: false },
    })
    const disabledCategory = await checkAdsForSiteKey(data.siteA.site_key, [
      { id: 'de', url: 'https://clean.example/ad', text: 'Glücksspiel' },
    ])
    assert.equal(hit(disabledCategory, 'de').matched, false)

    const reported = await reportCatchesForSiteKey(
      data.siteA.site_key,
      [{ url: 'https://offers.badcasino.com/ad' }],
      'load-1',
    )
    assert.equal(reported.recorded, 1)
    const event = await prisma.blockEvent.findFirst({
      where: { siteId: resolved.id, pageLoadId: 'load-1' },
    })
    assert.equal(event.organizationId, data.orgA.id)
    assert.equal(event.siteId, resolved.id)
    assert.equal(event.policyId, data.policyA.id)
    assert.equal(event.matchedRuleType, 'DOMAIN')
    assert.equal(event.matchedDomain, 'badcasino.com')

    const stolen = await reportCatchesForSiteKey(
      data.siteB.site_key,
      [{ url: 'https://example.com/bad-ad' }],
      'load-2',
    )
    assert.equal(stolen.recorded, 0)
    const leaked = await prisma.blockEvent.count({
      where: { organizationId: data.orgA.id, pageLoadId: 'load-2' },
    })
    assert.equal(leaked, 0)

    await revokeSiteKey(data.orgA.id, 'site-a.example', 'https://script.example')
    const revoked = await checkAdsForSiteKey(data.siteA.site_key, [
      { id: 'exact', url: 'https://example.com/bad-ad' },
    ])
    assert.equal(hit(revoked, 'exact').matched, false)
  } finally {
    await prisma.organization.delete({ where: { id: data.orgA.id } })
    await prisma.organization.delete({ where: { id: data.orgB.id } })
    await prisma.$disconnect()
  }
})

test('minified customer script has a version and no localhost or keyword list', () => {
  const file = fs.readFileSync(new URL('../public/a.min.js', import.meta.url), 'utf8')
  assert.match(file, /AdSnitch script version: 0\.3\.0/)
  assert.equal(file.includes('localhost'), false)
  assert.equal(file.includes('glücksspiel'), false)
  assert.equal(file.includes('window.location'), false)
  assert.equal(file.includes('document.referrer'), false)
})
