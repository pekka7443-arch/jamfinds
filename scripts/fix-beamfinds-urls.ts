/**
 * One-time backfill: BeamFinds detail pages live at /mod/{id} (singular).
 * Older rows still carry /mods/{id} in the permalink and in the links JSON,
 * which 404s on their site ("wrong pages" bug).
 */
import { PrismaClient } from "@prisma/client"

const p = new PrismaClient()

async function main() {
  const rows = await p.mod.findMany({
    where: {
      OR: [{ permalink: { contains: "beamfinds.com/mods/" } }, { links: { contains: "beamfinds.com/mods/" } }],
    },
    select: { id: true, permalink: true, links: true },
  })
  let n = 0
  for (const r of rows) {
    const permalink = r.permalink.replace("beamfinds.com/mods/", "beamfinds.com/mod/")
    const links = r.links.replaceAll("beamfinds.com/mods/", "beamfinds.com/mod/")
    await p.mod.update({ where: { id: r.id }, data: { permalink, links } })
    n++
  }
  console.log(`fixed ${n} beamfinds rows (/mods/ -> /mod/)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => p.$disconnect())
