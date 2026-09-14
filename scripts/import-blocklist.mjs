/**
 * Import data/blocklist.json into PostgreSQL.
 * Does not delete the JSON file. Safe to run more than once.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma } from '../src/server/db.js'
import { ensureDefaultTenant } from '../src/server/tenant.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataFile = path.join(root, 'data', 'blocklist.json')

function loadJson() {
  if (!fs.existsSync(dataFile)) return []
  const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
  return Array.isArray(parsed) ? parsed : []
}

async function main() {
  const tenant = await ensureDefaultTenant()
  const rows = loadJson()
  let imported = 0
  let events = 0

  for (const row of rows) {
    const url = String(row.url || '').trim()
    if (!url) continue

    const blocked = await prisma.blockedUrl.upsert({
      where: {
        policyId_url: { policyId: tenant.policyId, url },
      },
      update: { enabled: true },
      create: {
        ...(row.id ? { id: row.id } : {}),
        policyId: tenant.policyId,
        url,
        enabled: true,
        ...(row.created_at ? { createdAt: new Date(row.created_at) } : {}),
      },
    })
    imported += 1

    const catches = Array.isArray(row.caught_events) ? row.caught_events : []
    for (const event of catches) {
      const createdAt = event.at ? new Date(event.at) : new Date()
      const existing = await prisma.blockEvent.findFirst({
        where: {
          organizationId: tenant.organizationId,
          policyId: tenant.policyId,
          matchedRuleId: blocked.id,
          matchedUrl: url,
          pageLoadId: event.page_load_id || null,
          createdAt,
        },
        select: { id: true },
      })
      if (existing) continue
      await prisma.blockEvent.create({
        data: {
          organizationId: tenant.organizationId,
          siteId: tenant.siteId,
          policyId: tenant.policyId,
          matchedRuleType: 'URL',
          matchedRuleId: blocked.id,
          matchedUrl: url,
          pageLoadId: event.page_load_id || null,
          createdAt,
        },
      })
      events += 1
    }
  }

  const total = await prisma.blockedUrl.count({
    where: { policyId: tenant.policyId },
  })
  console.log(
    JSON.stringify(
      {
        ok: true,
        organizationId: tenant.organizationId,
        policyId: tenant.policyId,
        importedUrls: imported,
        importedEvents: events,
        storedUrls: total,
      },
      null,
      2,
    ),
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
