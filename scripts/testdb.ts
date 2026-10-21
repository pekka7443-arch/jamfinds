import { PrismaClient } from '@prisma/client'
const db = new PrismaClient({ log: [] })
const count = await db.mod.count()
const states = await db.syncState.findMany()
console.log('mods:', count, 'syncState:', JSON.stringify(states))
await db.$disconnect()
