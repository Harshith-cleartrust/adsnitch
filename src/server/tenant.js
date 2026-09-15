import crypto from 'node:crypto'
import { prisma } from './db.js'
import { POLICY_PACKS, keywordsForPack } from './policy-packs.js'

export const DEFAULT_ORG_NAME = 'AdSnitch'
export const DEFAULT_POLICY_NAME = 'Default URL blocklist'
export const DEFAULT_SITE_NAME = 'Default site'
export const DEFAULT_SITE_DOMAIN = 'localhost'

/**
 * Every read and write of organization-owned data must go through a tenant id.
 * Callers pass organizationId and filter on it. There is no unscoped list.
 */
export async function ensureDefaultTenant() {
  const organization =
    (await prisma.organization.findFirst({
      where: { name: DEFAULT_ORG_NAME },
    })) ||
    (await prisma.organization.create({ data: { name: DEFAULT_ORG_NAME } }))

  const policy = await prisma.policy.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: DEFAULT_POLICY_NAME,
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: DEFAULT_POLICY_NAME,
      description: 'Exact ad URL blocklist migrated from the original JSON store.',
      enabled: true,
    },
  })

  await seedDefaultPolicyPacks(policy.id)

  let site = await prisma.site.upsert({
    where: {
      organizationId_domain: {
        organizationId: organization.id,
        domain: DEFAULT_SITE_DOMAIN,
      },
    },
    update: { policyId: policy.id, active: true },
    create: {
      organizationId: organization.id,
      name: DEFAULT_SITE_NAME,
      domain: DEFAULT_SITE_DOMAIN,
      policyId: policy.id,
      active: true,
    },
  })

  if (!site.siteKey) {
    site = await prisma.site.update({
      where: { id: site.id },
      data: {
        siteKey: `ask_${crypto.randomBytes(24).toString('base64url')}`,
        keyActive: true,
      },
    })
  }

  return {
    organizationId: organization.id,
    policyId: policy.id,
    siteId: site.id,
  }
}

/**
 * Default policy starts with Gambling on and every other pack off.
 * Does not re-enable a pack an admin has turned off.
 * Inserts any missing pack keywords (skipDuplicates) so packs stay fully populated.
 */
export async function seedDefaultPolicyPacks(policyId) {
  await prisma.policyCategory.createMany({
    data: POLICY_PACKS.map((pack) => ({
      policyId,
      category: pack.id,
      enabled: pack.id === 'GAMBLING',
    })),
    skipDuplicates: true,
  })

  await seedPolicyPackKeywords(policyId)
}

/**
 * Ensure every category pack on a policy has the full keyword list.
 * New keywords are inserted; existing rows are left unchanged (including enabled).
 */
export async function seedPolicyPackKeywords(policyId) {
  await prisma.policyCategory.createMany({
    data: POLICY_PACKS.map((pack) => ({
      policyId,
      category: pack.id,
      enabled: false,
    })),
    skipDuplicates: true,
  })

  const categories = await prisma.policyCategory.findMany({
    where: { policyId },
    select: { category: true, enabled: true },
  })
  const enabledByCategory = new Map(categories.map((row) => [row.category, row.enabled]))

  await Promise.all(
    POLICY_PACKS.map(async (pack) => {
      const rows = keywordsForPack(pack.id)
      if (!rows.length) return
      const enabled = Boolean(enabledByCategory.get(pack.id))
      await prisma.blockedKeyword.createMany({
        data: rows.map((row) => ({
          policyId,
          keyword: row.keyword,
          language: row.language,
          category: row.category,
          enabled,
        })),
        skipDuplicates: true,
      })
    }),
  )
}

/**
 * Backfill pack keywords when a policy is missing the current list size.
 */
export async function ensurePolicyPackKeywords(policyId) {
  const expected = POLICY_PACKS.reduce(
    (sum, pack) => sum + keywordsForPack(pack.id).length,
    0,
  )
  const count = await prisma.blockedKeyword.count({
    where: { policyId, category: { not: null } },
  })
  if (count >= expected) return false
  await seedPolicyPackKeywords(policyId)
  return true
}

export async function isPolicyEnabled(organizationId, policyId) {
  const policy = await prisma.policy.findFirst({
    where: { id: policyId, organizationId, enabled: true },
    select: { id: true },
  })
  return Boolean(policy)
}

export async function listBlockedUrls(organizationId, policyId) {
  return prisma.blockedUrl.findMany({
    where: {
      policyId,
      policy: { organizationId, id: policyId },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function findBlockedUrlByNormalized(organizationId, policyId, url) {
  return prisma.blockedUrl.findFirst({
    where: {
      policyId,
      url,
      policy: { organizationId, id: policyId },
    },
  })
}

export async function createBlockedUrl(organizationId, policyId, url) {
  const policy = await prisma.policy.findFirst({
    where: { id: policyId, organizationId },
    select: { id: true },
  })
  if (!policy) {
    const error = new Error('Policy not found.')
    error.code = 'NOT_FOUND'
    throw error
  }
  return prisma.blockedUrl.create({
    data: { policyId, url, enabled: true },
  })
}

export async function deleteBlockedUrl(organizationId, policyId, id) {
  const existing = await prisma.blockedUrl.findFirst({
    where: {
      id,
      policyId,
      policy: { organizationId, id: policyId },
    },
    select: { id: true },
  })
  if (!existing) return false
  await prisma.$transaction([
    prisma.blockEvent.deleteMany({
      where: { organizationId, policyId, matchedRuleId: id },
    }),
    prisma.blockedUrl.delete({ where: { id } }),
  ])
  return true
}

export async function listUrlCatchEvents(organizationId, policyId, since) {
  return prisma.blockEvent.findMany({
    where: {
      organizationId,
      policyId,
      matchedRuleType: 'URL',
      createdAt: { gte: since },
    },
    select: {
      matchedRuleId: true,
      pageLoadId: true,
      createdAt: true,
    },
  })
}

export async function recordPolicyCatch({
  organizationId,
  siteId,
  policyId,
  match,
  url,
  pageLoadId,
}) {
  if (!match?.matched || !match.ruleId) return null
  return prisma.blockEvent.create({
    data: {
      organizationId,
      siteId,
      policyId,
      matchedRuleType: match.ruleType,
      matchedRuleId: match.ruleId,
      matchedUrl: url || null,
      matchedDomain: match.domain || null,
      matchedKeyword: match.keyword || null,
      matchedCategory: match.category || null,
      pageLoadId,
    },
  })
}

export async function recordUrlCatch({
  organizationId,
  siteId,
  policyId,
  blockedUrlId,
  url,
  pageLoadId,
}) {
  const rule = await prisma.blockedUrl.findFirst({
    where: {
      id: blockedUrlId,
      policyId,
      enabled: true,
      policy: { organizationId, id: policyId, enabled: true },
    },
    select: { id: true },
  })
  if (!rule) return null
  return prisma.blockEvent.create({
    data: {
      organizationId,
      siteId,
      policyId,
      matchedRuleType: 'URL',
      matchedRuleId: blockedUrlId,
      matchedUrl: url,
      pageLoadId,
    },
  })
}
