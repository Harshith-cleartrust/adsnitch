import assert from 'node:assert/strict'
import test from 'node:test'
import { canRead, canWrite, sameOrganization } from '../src/server/access.js'
import { deny } from '../src/server/policies.js'
import { prisma } from '../src/server/db.js'
import { addDomain, createPolicy, getPolicy } from '../src/server/policies.js'

test('roles: members can read, only owner and admin can write', () => {
  assert.equal(canRead('MEMBER'), true)
  assert.equal(canWrite('MEMBER'), false)
  assert.equal(canWrite('ADMIN'), true)
  assert.equal(canWrite('OWNER'), true)
  assert.equal(sameOrganization('org-a', 'org-b'), false)
})

test('organization A cannot access organization B policy or rules', async () => {
  const stamp = `step2-${Date.now()}`
  const orgA = await prisma.organization.create({ data: { name: `${stamp}-a` } })
  const orgB = await prisma.organization.create({ data: { name: `${stamp}-b` } })
  try {
    const policy = await createPolicy(orgA.id, { name: 'A only', description: 'private' })
    await addDomain(orgA.id, policy.id, 'badcasino.com')

    assert.equal(await getPolicy(orgB.id, policy.id), null)
    assert.equal(await addDomain(orgB.id, policy.id, 'other.com'), null)
    const blocked = deny({ organizationId: orgB.id, role: 'OWNER' }, orgA.id, true)
    assert.equal(blocked.status, 403)
    assert.equal(blocked.code, 'FORBIDDEN')

    const member = deny({ organizationId: orgA.id, role: 'MEMBER' }, orgA.id, true)
    assert.equal(member.status, 403)
    assert.equal(deny({ organizationId: orgA.id, role: 'ADMIN' }, orgA.id, false), null)
  } finally {
    await prisma.organization.delete({ where: { id: orgA.id } })
    await prisma.organization.delete({ where: { id: orgB.id } })
    await prisma.$disconnect()
  }
})
