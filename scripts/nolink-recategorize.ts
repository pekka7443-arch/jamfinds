/**
 * One-time backfill (Task 8): every row sitting in a download category
 * (vehicle/map/skin/parts/other) WITHOUT a real download link moves to the
 * new "no-link" bucket. Main categories end up "working mods only".
 *
 * BeamFinds/BeamFree rows always carry a beamfinds/beamfree permalink link
 * (a real file host), so they are untouched by definition.
 *
 * Run: bun scripts/nolink-recategorize.ts
 */

import { PrismaClient } from "@prisma/client"
import { hasDownloadLink } from "../src/lib/links"

const db = new PrismaClient()

const DOWNLOAD_CATS = new Set(["vehicle", "map", "skin", "parts", "other"])

async function main() {
  const mods = await db.mod.findMany({
    where: { category: { in: [...DOWNLOAD_CATS] } },
    select: { id: true, title: true, links: true, category: true },
  })
  console.log(`loaded ${mods.length} rows in download categories`)

  let moved = 0
  const movedFrom: Record<string, number> = {}

  for (const m of mods) {
    let links: { host: string; url: string }[] = []
    try {
      links = JSON.parse(m.links ?? "[]")
    } catch {
      links = []
    }
    if (hasDownloadLink(links)) continue
    movedFrom[m.category] = (movedFrom[m.category] ?? 0) + 1
    await db.mod.update({ where: { id: m.id }, data: { category: "no-link" } })
    moved++
    if (moved <= 12) console.log("  ->", m.id, "|", m.title.slice(0, 60))
  }

  const fmt = (x: Record<string, number>) =>
    Object.entries(x)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join("  ")

  console.log(`moved ${moved} rows to no-link (from: ${fmt(movedFrom)})`)

  // Final distribution
  const byCat = await db.mod.groupBy({ by: ["category"], _count: { _all: true } })
  console.log(
    "now:",
    byCat
      .map((c) => `${c.category}=${c._count._all}`)
      .sort()
      .join("  "),
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
