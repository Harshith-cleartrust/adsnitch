import { canRead, canWrite, sameOrganization } from './access.js'
import { prisma } from './db.js'
import { evaluateAds, matchAd, normalizeAdUrl, normalizeDomain } from './policy-match.js'
import { POLICY_PACKS, keywordsForPack, packById } from './policy-packs.js'
import { ensureDefaultTenant, ensurePolicyPackKeywords, seedPolicyPackKeywords } from './tenant.js'

export const DEMO_ADMIN_USERNAME = 'admin'
export const DEMO_ADMIN_EMAIL = 'admin@adsnitch.local'

export async function ensureDefaultActor() {
  const tenant = await ensureDefaultTenant()
  const user = await prisma.user.upsert({
    where: { email: DEMO_ADMIN_EMAIL },
    update: {},
    create: {
      email: DEMO_ADMIN_EMAIL,
      passwordHash: 'demo-login-not-used',
    },
  })
  const member = await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: tenant.organizationId,
        userId: user.id,
      },
    },
    update: {},
    create: {
      organizationId: tenant.organizationId,
      userId: user.id,
      role: 'OWNER',
    },
  })

  return {
    ...tenant,
    userId: user.id,
    role: member.role,
    email: user.email,
  }
}

export async function resolveActor(session) {
  if (!session?.username) return null
  if (session.username !== DEMO_ADMIN_USERNAME) return null
  return ensureDefaultActor()
}

export function deny(actor, organizationId, write) {
  if (!actor || !canRead(actor.role) || !sameOrganization(actor.organizationId, organizationId)) {
    return { status: 403, error: 'You cannot access another organization.', code: 'FORBIDDEN' }
  }
  if (write && !canWrite(actor.role)) {
    return { status: 403, error: 'This role cannot change the policy.', code: 'FORBIDDEN' }
  }
  return null
}

function serializePolicy(policy, rules, packCounts = {}) {
  return {
    id: policy.id,
    organization_id: policy.organizationId,
    name: policy.name,
    description: policy.description || '',
    enabled: policy.enabled,
    created_at: policy.createdAt,
    updated_at: policy.updatedAt,
    urls: rules.urls,
    domains: rules.domains,
    keywords: rules.keywords.filter((row) => !row.category),
    categories: POLICY_PACKS.map((pack) => {
      const saved = rules.categories.find((row) => row.category === pack.id)
      return {
        id: saved?.id || null,
        category: pack.id,
        name: pack.name,
        populated: pack.populated,
        enabled: Boolean(saved?.enabled),
        keyword_count: packCounts[pack.id] ?? 0,
        // Pack keyword rows are loaded on demand (200+ each).
        keywords: [],
      }
    }),
  }
}

async function loadRules(organizationId, policyId) {
  const policy = await prisma.policy.findFirst({
    where: { id: policyId, organizationId },
  })
  if (!policy) return null
  const [urls, domains, keywords, categories] = await Promise.all([
    prisma.blockedUrl.findMany({
      where: { policyId, policy: { organizationId } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.blockedDomain.findMany({
      where: { policyId, policy: { organizationId } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.blockedKeyword.findMany({
      where: { policyId, policy: { organizationId } },
      orderBy: { keyword: 'asc' },
    }),
    prisma.policyCategory.findMany({
      where: { policyId, policy: { organizationId } },
    }),
  ])
  return { policy, urls, domains, keywords, categories }
}

/** Admin editor payload: skip shipping thousands of pack keywords. */
async function loadPolicyEditor(organizationId, policyId) {
  const policy = await prisma.policy.findFirst({
    where: { id: policyId, organizationId },
  })
  if (!policy) return null
  const [urls, domains, customKeywords, categories, packCountRows] = await Promise.all([
    prisma.blockedUrl.findMany({
      where: { policyId, policy: { organizationId } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.blockedDomain.findMany({
      where: { policyId, policy: { organizationId } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.blockedKeyword.findMany({
      where: { policyId, policy: { organizationId }, category: null },
      orderBy: { keyword: 'asc' },
    }),
    prisma.policyCategory.findMany({
      where: { policyId, policy: { organizationId } },
    }),
    prisma.blockedKeyword.groupBy({
      by: ['category'],
      where: { policyId, policy: { organizationId }, category: { not: null } },
      _count: { _all: true },
    }),
  ])
  const packCounts = Object.fromEntries(
    packCountRows.map((row) => [row.category, row._count._all]),
  )
  return {
    policy,
    urls,
    domains,
    keywords: customKeywords,
    categories,
    packCounts,
  }
}

export async function listPolicies(organizationId) {
  const rows = await prisma.policy.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map((row) => ({
    id: row.id,
    organization_id: row.organizationId,
    name: row.name,
    description: row.description || '',
    enabled: row.enabled,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }))
}

export async function getPolicy(organizationId, policyId) {
  await ensurePolicyPackKeywords(policyId)
  const loaded = await loadPolicyEditor(organizationId, policyId)
  if (!loaded) return null
  return serializePolicy(loaded.policy, loaded, loaded.packCounts)
}

export async function listCategoryKeywords(organizationId, policyId, category) {
  const pack = packById(category)
  if (!pack) {
    const error = new Error('Unknown policy pack.')
    error.code = 'INVALID'
    throw error
  }
  const policy = await prisma.policy.findFirst({
    where: { id: policyId, organizationId },
    select: { id: true },
  })
  if (!policy) return null
  const rows = await prisma.blockedKeyword.findMany({
    where: { policyId, category: pack.id, policy: { organizationId } },
    orderBy: [{ language: 'asc' }, { keyword: 'asc' }],
    select: { id: true, keyword: true, language: true },
  })
  return { category: pack.id, name: pack.name, keywords: rows }
}

export async function createPolicy(organizationId, input) {
  const name = String(input.name || '').trim()
  if (!name) {
    const error = new Error('Policy name is required.')
    error.code = 'INVALID'
    throw error
  }
  const policy = await prisma.policy.create({
    data: {
      organizationId,
      name,
      description: String(input.description || '').trim(),
      enabled: input.enabled !== false,
      categories: {
        create: POLICY_PACKS.map((pack) => ({
          category: pack.id,
          enabled: false,
        })),
      },
    },
  })
  await seedPolicyPackKeywords(policy.id)
  return getPolicy(organizationId, policy.id)
}

export async function updatePolicy(organizationId, policyId, input) {
  const existing = await prisma.policy.findFirst({
    where: { id: policyId, organizationId },
  })
  if (!existing) return null
  const data = {}
  if (input.name !== undefined) {
    const name = String(input.name || '').trim()
    if (!name) {
      const error = new Error('Policy name is required.')
      error.code = 'INVALID'
      throw error
    }
    data.name = name
  }
  if (input.description !== undefined) data.description = String(input.description || '').trim()
  if (input.enabled !== undefined) data.enabled = Boolean(input.enabled)
  await prisma.policy.update({ where: { id: existing.id }, data })
  return getPolicy(organizationId, existing.id)
}

export async function deletePolicy(organizationId, policyId) {
  const existing = await prisma.policy.findFirst({
    where: { id: policyId, organizationId },
  })
  if (!existing) return false
  const tenant = await ensureDefaultTenant()
  if (existing.id === tenant.policyId) {
    const error = new Error('The default policy cannot be deleted.')
    error.code = 'INVALID'
    throw error
  }
  await prisma.policy.delete({ where: { id: existing.id } })
  return true
}

export async function addDomain(organizationId, policyId, raw) {
  const policy = await prisma.policy.findFirst({
    where: { id: policyId, organizationId },
    select: { id: true },
  })
  if (!policy) return null
  const domain = normalizeDomain(raw)
  return prisma.blockedDomain.create({
    data: { policyId, domain, enabled: true },
  })
}

export async function deleteDomain(organizationId, policyId, id) {
  const row = await prisma.blockedDomain.findFirst({
    where: { id, policyId, policy: { organizationId } },
  })
  if (!row) return false
  await prisma.blockedDomain.delete({ where: { id: row.id } })
  return true
}

export async function addKeyword(organizationId, policyId, raw, language, category) {
  const policy = await prisma.policy.findFirst({
    where: { id: policyId, organizationId },
    select: { id: true },
  })
  if (!policy) return null
  const keyword = String(raw || '').trim().toLowerCase()
  const lang = String(language || 'en').trim().toLowerCase()
  const pack = category ? packById(category) : null
  if (keyword.length < 2) {
    const error = new Error('Keyword must be at least 2 characters.')
    error.code = 'INVALID'
    throw error
  }
  if (!['en', 'de'].includes(lang)) {
    const error = new Error('Language must be English or German.')
    error.code = 'INVALID'
    throw error
  }
  if (category && !pack) {
    const error = new Error('Unknown policy pack.')
    error.code = 'INVALID'
    throw error
  }
  return prisma.blockedKeyword.create({
    data: {
      policyId,
      keyword,
      language: lang,
      category: pack?.id || null,
      enabled: true,
    },
  })
}

export async function deleteKeyword(organizationId, policyId, id) {
  const row = await prisma.blockedKeyword.findFirst({
    where: { id, policyId, policy: { organizationId } },
  })
  if (!row) return false
  await prisma.blockedKeyword.delete({ where: { id: row.id } })
  return true
}

export async function setCategoryEnabled(organizationId, policyId, category, enabled) {
  const pack = packById(category)
  if (!pack) {
    const error = new Error('Unknown policy pack.')
    error.code = 'INVALID'
    throw error
  }
  const policy = await prisma.policy.findFirst({
    where: { id: policyId, organizationId },
    select: { id: true },
  })
  if (!policy) return null

  await prisma.policyCategory.upsert({
    where: { policyId_category: { policyId, category: pack.id } },
    update: { enabled },
    create: { policyId, category: pack.id, enabled },
  })

  if (enabled && pack.populated) {
    const rows = keywordsForPack(pack.id)
    await prisma.blockedKeyword.createMany({
      data: rows.map((row) => ({
        policyId,
        keyword: row.keyword,
        language: row.language,
        category: pack.id,
        enabled: true,
      })),
      skipDuplicates: true,
    })
  }
  await prisma.blockedKeyword.updateMany({
    where: { policyId, category: pack.id },
    data: { enabled },
  })

  return getPolicy(organizationId, policyId)
}

export async function checkAds(organizationId, policyId, ads) {
  const loaded = await loadRules(organizationId, policyId)
  if (!loaded) return []
  return evaluateAds(ads, {
    enabled: loaded.policy.enabled,
    urls: loaded.urls,
    domains: loaded.domains,
    keywords: loaded.keywords,
    categories: loaded.categories,
  })
}

export async function previewMatch(organizationId, policyId, input) {
  const loaded = await loadRules(organizationId, policyId)
  if (!loaded) return null
  const result = matchAd(
    { url: input.url, text: input.text },
    {
      enabled: loaded.policy.enabled,
      urls: loaded.urls,
      domains: loaded.domains,
      keywords: loaded.keywords,
      categories: loaded.categories,
    },
  )
  return result
}

export function assertAdUrl(raw) {
  return normalizeAdUrl(raw)
}
