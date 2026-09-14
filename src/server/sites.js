import crypto from 'node:crypto'
import { prisma } from './db.js'
import { checkAds } from './policies.js'
import { normalizeDomain } from './policy-match.js'
import { installSnippet, scriptOrigin } from './script-origin.js'
import { ensureDefaultTenant, recordPolicyCatch } from './tenant.js'

const KEY_BYTES = 24

export function generateSiteKey() {
  return `ask_${crypto.randomBytes(KEY_BYTES).toString('base64url')}`
}

function unmatched(ad, index) {
  return {
    id: ad?.id != null ? String(ad.id) : String(index),
    input: String(ad?.url || ''),
    matched: false,
  }
}

function publicSite(site, origin) {
  const key = site.keyActive ? site.siteKey : null
  return {
    name: site.name,
    domain: site.domain,
    active: site.active,
    key_active: site.keyActive,
    site_key: key,
    policy_id: site.policyId,
    policy_name: site.policy?.name || '',
    snippet: key && site.active ? installSnippet(origin, key) : '',
  }
}

async function uniqueKey() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const siteKey = generateSiteKey()
    const taken = await prisma.site.findUnique({ where: { siteKey }, select: { id: true } })
    if (!taken) return siteKey
  }
  const error = new Error('Could not generate a site key.')
  error.code = 'ERROR'
  throw error
}

export function installOrigin(requestHost) {
  return scriptOrigin({
    configured: process.env.SCRIPT_ORIGIN,
    nodeEnv: process.env.NODE_ENV,
    requestHost,
  })
}

export async function scriptForPolicy(organizationId, policyId, origin) {
  const policy = await prisma.policy.findFirst({
    where: { id: policyId, organizationId },
    select: { id: true, name: true },
  })
  if (!policy) return null

  let site = await prisma.site.findFirst({
    where: {
      organizationId,
      policyId: policy.id,
      active: true,
      keyActive: true,
      siteKey: { not: null },
    },
    orderBy: { createdAt: 'asc' },
  })
  if (!site) {
    const domain = `p${policy.id.replace(/-/g, '')}.install`
    site = await prisma.site.create({
      data: {
        organizationId,
        name: policy.name,
        domain,
        policyId: policy.id,
        active: true,
        siteKey: await uniqueKey(),
        keyActive: true,
      },
    })
  }
  return {
    policy_id: policy.id,
    policy_name: policy.name,
    snippet: installSnippet(origin, site.siteKey),
  }
}

export async function listSites(organizationId, origin) {
  const rows = await prisma.site.findMany({
    where: { organizationId },
    include: { policy: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map((row) => publicSite(row, origin))
}

export async function createSite(organizationId, input, origin) {
  const name = String(input.name || '').trim()
  const domain = normalizeDomain(input.domain)
  if (!name) {
    const error = new Error('Site name is required.')
    error.code = 'INVALID'
    throw error
  }
  if (input.policy_id) {
    const policy = await prisma.policy.findFirst({
      where: { id: input.policy_id, organizationId },
      select: { id: true },
    })
    if (!policy) {
      const error = new Error('Policy not found.')
      error.code = 'INVALID'
      throw error
    }
  }
  const site = await prisma.site.create({
    data: {
      organizationId,
      name,
      domain,
      policyId: input.policy_id || null,
      active: input.active !== false,
      siteKey: await uniqueKey(),
      keyActive: true,
    },
    include: { policy: { select: { name: true } } },
  })
  return publicSite(site, origin)
}

async function ownedSite(organizationId, domain) {
  return prisma.site.findFirst({
    where: { organizationId, domain },
    include: { policy: { select: { name: true } } },
  })
}

export async function regenerateSiteKey(organizationId, domain, origin) {
  const site = await ownedSite(organizationId, domain)
  if (!site) return null
  const updated = await prisma.site.update({
    where: { id: site.id },
    data: { siteKey: await uniqueKey(), keyActive: true, active: true },
    include: { policy: { select: { name: true } } },
  })
  return publicSite(updated, origin)
}

export async function revokeSiteKey(organizationId, domain, origin) {
  const site = await ownedSite(organizationId, domain)
  if (!site) return null
  const updated = await prisma.site.update({
    where: { id: site.id },
    data: { keyActive: false },
    include: { policy: { select: { name: true } } },
  })
  return publicSite(updated, origin)
}

export async function assignSitePolicy(organizationId, domain, policyId, origin) {
  const site = await ownedSite(organizationId, domain)
  if (!site) return null
  if (policyId) {
    const policy = await prisma.policy.findFirst({
      where: { id: policyId, organizationId },
      select: { id: true },
    })
    if (!policy) {
      const error = new Error('Policy not found.')
      error.code = 'INVALID'
      throw error
    }
  }
  const updated = await prisma.site.update({
    where: { id: site.id },
    data: { policyId: policyId || null },
    include: { policy: { select: { name: true } } },
  })
  return publicSite(updated, origin)
}

/**
 * Site key identifies the site. It is not an admin credential.
 * Missing, revoked, or inactive keys fail open (null).
 */
export async function resolveSiteByKey(siteKey) {
  const key = String(siteKey || '').trim()
  if (!key) return null
  const site = await prisma.site.findUnique({
    where: { siteKey: key },
    include: { policy: { select: { id: true, enabled: true, organizationId: true } } },
  })
  if (!site || !site.keyActive || !site.active) return null
  if (site.policy && site.policy.organizationId !== site.organizationId) return null
  return site
}

function adInputs(ads) {
  return (Array.isArray(ads) ? ads : []).slice(0, 80).map((ad) => ({
    id: ad?.id,
    url: ad?.url,
    text: ad?.text,
  }))
}

export async function checkAdsForSiteKey(siteKey, ads) {
  const inputs = adInputs(ads)
  try {
    const site = await resolveSiteByKey(siteKey)
    if (!site?.policyId) return inputs.map(unmatched)
    return await checkAds(site.organizationId, site.policyId, inputs)
  } catch (err) {
    console.error('[site-check] fail open', err)
    return inputs.map(unmatched)
  }
}

export async function reportCatchesForSiteKey(siteKey, ads, pageLoadId) {
  const site = await resolveSiteByKey(siteKey)
  if (!site?.policyId) return { recorded: 0 }
  const results = await checkAds(site.organizationId, site.policyId, adInputs(ads))
  let recorded = 0
  for (const match of results) {
    if (!match.matched) continue
    let url = match.input
    try {
      url = new URL(match.input).toString()
    } catch {
      // Keep the ad URL string the matcher already accepted.
    }
    await recordPolicyCatch({
      organizationId: site.organizationId,
      siteId: site.id,
      policyId: site.policyId,
      match,
      url,
      pageLoadId: String(pageLoadId || '').slice(0, 80) || crypto.randomUUID(),
    })
    recorded += 1
  }
  return { recorded }
}

export async function ensureDefaultSiteKey() {
  const tenant = await ensureDefaultTenant()
  const site = await prisma.site.findUnique({ where: { id: tenant.siteId } })
  if (site?.siteKey) return site
  return prisma.site.update({
    where: { id: tenant.siteId },
    data: { siteKey: await uniqueKey(), keyActive: true },
  })
}
