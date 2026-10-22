/**
 * One-off: import BeamFree mod 96 — a real, sitemap-listed mod (BMW M5
 * G90/G99 V1.3) that never appears on any /mods listing page because it was
 * uploaded as a modsfire link rather than a BeamFree-hosted file. Inserted
 * through the shared normalize/upsert path (catHint "Cars" -> vehicle); the
 * detail-enrichment pass then adds its description + gallery like any other
 * row. Everything is taken verbatim from the public page — no fabricated
 * metadata (their own display title is kept as-is).
 *
 * Run: NODE_ENV=production bun scripts/beamfree-add-96.ts
 */

import { db } from "../src/lib/db"
import { upsertEntries } from "../src/lib/sync"

async function main() {
  const permalink = "https://beamfree.pro/mod/96"
  const result = await upsertEntries([
    {
      id: "free-96",
      source: "BeamFree",
      title: "File sharing - https://modsfire.com/9tZ1a3bgl54EMhv",
      author: "BeamFree", // page credits "via modsfire.com", no creator name published
      permalink,
      publishedAt: new Date(),
      text: "",
      thumbnail: "https://beamfree.pro/cover/96",
      images: ["https://beamfree.pro/cover/96"],
      links: [{ url: permalink, host: "beamfree", label: "BeamFree", decoded: false }],
      catHint: "Cars",
    },
  ])
  console.log("free-96:", JSON.stringify(result))
  const row = await db.mod.findUnique({ where: { id: "free-96" }, select: { title: true, category: true } })
  console.log("row:", JSON.stringify(row))
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
