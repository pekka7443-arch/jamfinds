/**
 * One-shot backfill: compute contentHash for every Mod row that predates
 * Task 15. Safe to re-run (only touches contentHash IS NULL rows).
 * Run: bun scripts/backfill-content-hash.ts
 */
import { PrismaClient } from "@prisma/client"
import { contentSlug } from "../src/lib/slug"

const db = new PrismaClient()

async function main() {
  const BATCH = 200
  let done = 0
  for (;;) {
    const rows = await db.mod.findMany({
      where: { contentHash: null },
      select: { id: true, rawTitle: true },
      take: BATCH,
    })
    if (rows.length === 0) break
    for (const r of rows) {
      const hash = contentSlug(r.rawTitle) || null
      await db.mod.update({ where: { id: r.id }, data: { contentHash: hash } })
      done++
    }
    console.log(`  hashed ${done}...`)
  }
  const multi = await db.$queryRaw<{ contentHash: string; n: number; sources: number }[]>`
    SELECT contentHash, COUNT(*) as n, COUNT(DISTINCT source) as sources
    FROM Mod WHERE contentHash IS NOT NULL
    GROUP BY contentHash
    HAVING COUNT(DISTINCT source) > 1`
  console.log(`Backfilled ${done} rows. Cross-source duplicate groups: ${multi.length}`)
  for (const g of multi.slice(0, 8)) console.log(`  ${g.contentHash} — ${g.n} rows on ${g.sources} sources`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
