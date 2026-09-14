import { prisma } from '../src/server/db.js'

const result = await prisma.$queryRaw`SELECT 1 AS ok`
const tables = await prisma.$queryRaw`
  SELECT tablename
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename
`
const urls = await prisma.blockedUrl.findMany({
  select: { url: true, enabled: true },
  orderBy: { createdAt: 'desc' },
})

console.log(
  JSON.stringify(
    {
      connected: result[0]?.ok === 1,
      tables: tables.map((row) => row.tablename),
      urls: urls.map((row) => row.url),
    },
    null,
    2,
  ),
)

await prisma.$disconnect()
