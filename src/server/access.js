export function canRead(role) {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MEMBER'
}

export function canWrite(role) {
  return role === 'OWNER' || role === 'ADMIN'
}

export function sameOrganization(actorOrgId, resourceOrgId) {
  return Boolean(actorOrgId && resourceOrgId && actorOrgId === resourceOrgId)
}
