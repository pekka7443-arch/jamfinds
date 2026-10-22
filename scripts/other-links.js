const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const mods = await p.mod.findMany({ where: { hasLinks: true }, select: { links: true, source: true } });
  const byHost = {};
  for (const m of mods) {
    let arr; try { arr = JSON.parse(m.links); } catch { continue; }
    for (const l of arr) {
      if (l.host !== "other") continue;
      try { const h = new URL(l.url).hostname.replace(/^www\./,""); byHost[h] = (byHost[h]||0)+1; } catch {}
    }
  }
  console.log("other-bucket hostnames:", JSON.stringify(byHost, null, 1));
  await p.$disconnect();
})();
