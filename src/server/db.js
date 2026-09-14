import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return
  const file = path.resolve(process.cwd(), '.env')
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/)
    if (!match) continue
    process.env.DATABASE_URL = match[1].replace(/^["']|["']$/g, '')
  }
}

loadDatabaseUrl()

const globalForPrisma = globalThis

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
