import assert from 'node:assert/strict'
import test from 'node:test'
import { prisma } from '../src/server/db.js'
import { keywordsForPack } from '../src/server/policy-packs.js'
import { seedDefaultPolicyPacks } from '../src/server/tenant.js'

test('a new default policy enables Gambling only and stores English and German keywords', async () => {
  const stamp = `gambling-default-${Date.now()}`
  const organization = await prisma.organization.create({ data: { name: stamp } })
  const policy = await prisma.policy.create({
    data: { organizationId: organization.id, name: 'Default URL blocklist', enabled: true },
  })

  try {
    await seedDefaultPolicyPacks(policy.id)

    const categories = await prisma.policyCategory.findMany({ where: { policyId: policy.id } })
    const enabled = categories.filter((row) => row.enabled).map((row) => row.category)
    assert.deepEqual(enabled, ['GAMBLING'])
    assert.equal(categories.length, 10)

    const keywords = await prisma.blockedKeyword.findMany({
      where: { policyId: policy.id, category: 'GAMBLING' },
    })
    const expected = keywordsForPack('GAMBLING')
    assert.equal(keywords.length, expected.length)
    assert.equal(keywords.every((row) => row.enabled), true)
    assert.ok(keywords.some((row) => row.language === 'en' && row.keyword === 'casino'))
    assert.ok(keywords.some((row) => row.language === 'de' && row.keyword === 'glücksspiel'))

    await prisma.policyCategory.update({
      where: { policyId_category: { policyId: policy.id, category: 'GAMBLING' } },
      data: { enabled: false },
    })
    await seedDefaultPolicyPacks(policy.id)
    const after = await prisma.policyCategory.findUnique({
      where: { policyId_category: { policyId: policy.id, category: 'GAMBLING' } },
    })
    assert.equal(after.enabled, false)
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } })
    await prisma.$disconnect()
  }
})
