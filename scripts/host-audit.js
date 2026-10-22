const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const mods = await p.mod.findMany({ where: { hasLinks: true }, select: { links: true } });
  const hosts = {};
  const samples = {};
  let total = 0;
  for (const m of mods) {
    let arr;
    try { arr = JSON.parse(m.links); } catch { continue; }
    for (const l of arr) {
      if (!l || !l.host) continue;
      total++;
      hosts[l.host] = (hosts[l.host] || 0) + 1;
      if (!samples[l.host]) samples[l.host] = [];
      if (samples[l.host].length < 3) samples[l.host].push(l.url);
    }
  }
  console.log("TOTAL LINKS:", total);
  const sorted = Object.entries(hosts).sort((a, b) => b[1] - a[1]);
  for (const [h, c] of sorted) {
    console.log(`${h.padEnd(14)} ${String(c).padStart(5)}  (${(c * 100 / total).toFixed(1)}%)`);
    for (const u of samples[h]) console.log("      " + u.slice(0, 120));
  }
  await p.$disconnect();
})();
