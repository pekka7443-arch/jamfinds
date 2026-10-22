const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  for (const src of ["BeamFinds", "BeamFree"]) {
    const rows = await p.mod.findMany({
      where: { source: src, hasLinks: true },
      select: { links: true, title: true },
      take: 4, orderBy: { firstSeenAt: "desc" },
    });
    console.log(`== ${src}`);
    for (const r of rows) {
      const l = JSON.parse(r.links)[0];
      console.log(" ", l.url, "|", r.title.slice(0, 50));
    }
  }
  await p.$disconnect();
})();
