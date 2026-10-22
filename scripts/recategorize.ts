/**
 * One-time backfill: re-run category inference on every stored mod with the
 * new request-first rules, so older rows (beyond RSS feed coverage) also
 * follow the "requests only in the Requests section" policy.
 *
 * Run: bun scripts/recategorize.ts
 */

import { PrismaClient } from "@prisma/client"
import { inferCategory } from "../src/lib/links"

const db = new PrismaClient()

async function main() {
  const mods = await db.mod.findMany({
    select: { id: true, title: true, text: true, hasLinks: true, category: true },
  })
  console.log(`loaded ${mods.length} mods`)

  const before: Record<string, number> = {}
  const after: Record<string, number> = {}
  let changed = 0

  for (const m of mods) {
    const next = inferCategory(m.title, m.text, m.hasLinks)
    before[m.category] = (before[m.category] ?? 0) + 1
    after[next] = (after[next] ?? 0) + 1
    if (next !== m.category) {
      changed++
      await db.mod.update({ where: { id: m.id }, data: { category: next } })
    }
  }

  const fmt = (x: Record<string, number>) =>
    Object.entries(x)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join("  ")

  console.log("before:", fmt(before))
  console.log("after: ", fmt(after))
  console.log(`re-categorized ${changed} rows`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
